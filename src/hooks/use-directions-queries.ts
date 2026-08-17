import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import type {
  ActiveWaypoint,
  ParsedDirectionsGeometry,
  ValhallaRouteResponse,
} from '@/components/types';
import {
  getValhallaUrl,
  buildDirectionsRequest,
  parseDirectionsGeometry,
  showValhallaWarnings,
  VALHALLA_CLIENT_HEADERS,
} from '@/utils/valhalla';
import { forward_geocode, parseGeocodeResponse } from '@/utils/nominatim';
import { buildCostingOptions } from '@/utils/build-costing-options';
import { getDirectionsLanguage } from '@/utils/directions-language';
import { useCommonStore, type Profile } from '@/stores/common-store';
import {
  useDirectionsStore,
  type ProfileRouteResult,
  type Waypoint,
} from '@/stores/directions-store';
import { getProfileLabel, parseProfilesWithFallback } from '@/utils/profiles';
import { router } from '@/routes';

const getActiveWaypoints = (waypoints: Waypoint[]): ActiveWaypoint[] =>
  waypoints.flatMap((wp) => wp.geocodeResults.filter((r) => r.selected));

async function fetchDirectionsForProfile(
  profile: Profile,
  activeWaypoints: ActiveWaypoint[]
): Promise<ParsedDirectionsGeometry> {
  const { dateTime, shared, perProfile } = useCommonStore.getState();
  const settings = buildCostingOptions(profile, { shared, perProfile });
  const language = getDirectionsLanguage();

  const valhallaRequest = buildDirectionsRequest({
    profile,
    activeWaypoints,
    // @ts-expect-error todo: initial settings and filtered settings types mismatch
    settings,
    dateTime,
    language,
  });
  const params = new URLSearchParams({
    json: JSON.stringify(valhallaRequest.json),
  });

  const response = await fetch(`${getValhallaUrl()}/route?${params}`, {
    headers: {
      'Content-Type': 'application/json',
      ...VALHALLA_CLIENT_HEADERS,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    let error_msg = errorData.error || 'Could not fetch resource';

    // Append context for route-specific error
    if (errorData.error_code === 154) {
      error_msg += ` for route.`;
    }

    throw new Error(error_msg);
  }

  const data: ValhallaRouteResponse = await response.json();

  // Parse geometry for main route
  (data as ParsedDirectionsGeometry).decodedGeometry =
    parseDirectionsGeometry(data);

  // Parse geometry for alternates
  data.alternates?.forEach((alternate, i) => {
    if (alternate) {
      (data.alternates![i] as ParsedDirectionsGeometry).decodedGeometry =
        parseDirectionsGeometry(alternate);
    }
  });

  showValhallaWarnings(data.trip.warnings);

  return data as ParsedDirectionsGeometry;
}

/**
 * Routes every selected profile between the same waypoints. Profiles are
 * requested concurrently and settled independently, so one costing model the
 * server rejects doesn't hide the routes that did come back.
 */
async function fetchDirections(): Promise<ProfileRouteResult[] | null> {
  const waypoints = useDirectionsStore.getState().waypoints;
  const profiles = parseProfilesWithFallback(
    router.state.location.search.profile
  );

  const activeWaypoints = getActiveWaypoints(waypoints);
  if (activeWaypoints.length < 2) {
    return null;
  }

  const settled = await Promise.allSettled(
    profiles.map((profile) =>
      fetchDirectionsForProfile(profile, activeWaypoints)
    )
  );

  const results: ProfileRouteResult[] = [];
  const failures: string[] = [];

  settled.forEach((outcome, i) => {
    const profile = profiles[i]!;
    if (outcome.status === 'fulfilled') {
      results.push({ profile, data: outcome.value });
    } else {
      const reason =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : 'Could not fetch resource';
      failures.push(`${getProfileLabel(profile)}: ${reason}`);
    }
  });

  if (failures.length > 0) {
    toast.warning(
      failures.length === profiles.length
        ? 'No routes could be calculated'
        : 'Some profiles returned no route',
      {
        description: failures.join('\n'),
        position: 'bottom-center',
        duration: 5000,
        closeButton: true,
      }
    );
  }

  if (results.length === 0) {
    throw new Error(failures[0] ?? 'Could not fetch resource');
  }

  return results;
}

export function useDirectionsQuery() {
  const showLoading = useCommonStore((state) => state.showLoading);
  const zoomTo = useCommonStore((state) => state.zoomTo);
  const receiveRouteResults = useDirectionsStore(
    (state) => state.receiveRouteResults
  );
  const clearRoutes = useDirectionsStore((state) => state.clearRoutes);

  return useQuery({
    queryKey: ['directions'],
    queryFn: async () => {
      showLoading(true);
      try {
        const results = await fetchDirections();
        if (results) {
          receiveRouteResults({ results });
          // Fit every profile's route, not just the first one.
          zoomTo(results.flatMap((result) => result.data.decodedGeometry));
        }
        return results;
      } catch (error) {
        clearRoutes();
        throw error;
      } finally {
        setTimeout(() => showLoading(false), 500);
      }
    },
    enabled: false,
    retry: false,
  });
}

export function useSetWaypointFromCoords() {
  const receiveGeocodeResults = useDirectionsStore(
    (state) => state.receiveGeocodeResults
  );
  const updateTextInput = useDirectionsStore((state) => state.updateTextInput);
  const addEmptyWaypointToEnd = useDirectionsStore(
    (state) => state.addEmptyWaypointToEnd
  );
  const updatePlaceholderAddressAtIndex = useDirectionsStore(
    (state) => state.updatePlaceholderAddressAtIndex
  );

  const setWaypointFromCoords = async (
    lng: number,
    lat: number,
    index: number,
    options?: { isPermalink?: boolean }
  ) => {
    // For permalink loading, add waypoint if needed
    if (options?.isPermalink) {
      const waypointCount = useDirectionsStore.getState().waypoints.length;
      const missingWaypoints = index + 1 - waypointCount;

      for (let i = 0; i < missingWaypoints; i++) {
        addEmptyWaypointToEnd();
      }
    }

    // Set placeholder immediately
    updatePlaceholderAddressAtIndex(index, lng, lat);

    const lngLat: [number, number] = [lng, lat];
    const address: ActiveWaypoint = {
      title: `${lng.toFixed(6)}, ${lat.toFixed(6)}`,
      key: 0,
      selected: true,
      addresslnglat: lngLat,
      sourcelnglat: lngLat,
      displaylnglat: lngLat,
      addressindex: 0,
    };
    const addresses = [address];
    receiveGeocodeResults({ addresses, index });
    updateTextInput({
      inputValue: address.title,
      index,
      addressindex: 0,
    });
    return addresses;
  };

  return { setWaypointFromCoords };
}

async function fetchForwardGeocode(
  userInput: string,
  lngLat?: [number, number]
): Promise<ActiveWaypoint[]> {
  if (lngLat) {
    return [
      {
        title: lngLat.toString(),
        key: 0,
        selected: false,
        addresslnglat: lngLat,
        sourcelnglat: lngLat,
        displaylnglat: lngLat,
        addressindex: 0,
      },
    ];
  }

  const response = await forward_geocode(userInput);
  const addresses = parseGeocodeResponse(response.data);

  if (addresses.length === 0) {
    toast.warning('No addresses', {
      description: 'Sorry, no addresses can be found.',
      position: 'bottom-center',
      duration: 5000,
      closeButton: true,
    });
  }

  return addresses as ActiveWaypoint[];
}

export function useForwardGeocodeDirections() {
  const receiveGeocodeResults = useDirectionsStore(
    (state) => state.receiveGeocodeResults
  );

  const forwardGeocode = async (
    userInput: string,
    index: number,
    lngLat?: [number, number]
  ) => {
    try {
      const addresses = await fetchForwardGeocode(userInput, lngLat);
      receiveGeocodeResults({
        addresses,
        index,
      });
      return addresses;
    } catch (error) {
      console.error('Forward geocode error:', error);
      throw error;
    }
  };

  return { forwardGeocode };
}
