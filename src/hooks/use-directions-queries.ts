import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import type {
  ActiveWaypoint,
  ParsedDirectionsGeometry,
  ValhallaRouteResponse,
} from '@/components/types';
import {
  getInstanceUrl,
  buildDirectionsRequest,
  parseDirectionsGeometry,
  showValhallaWarnings,
  VALHALLA_CLIENT_HEADERS,
} from '@/utils/valhalla';
import { forward_geocode, parseGeocodeResponse } from '@/utils/nominatim';
import { buildCostingOptions } from '@/utils/build-costing-options';
import {
  classifyValhallaError,
  toRequestError,
  ValhallaError,
} from '@/utils/valhalla-errors';
import { getDirectionsLanguage } from '@/utils/directions-language';
import { useCommonStore, getTargetScope } from '@/stores/common-store';
import {
  useDirectionsStore,
  type TargetFailure,
  type TargetRouteResult,
  type Waypoint,
} from '@/stores/directions-store';
import { useInstancesStore } from '@/stores/instances-store';
import { readSelectedTargets } from '@/hooks/use-selected-targets';
import { getProfileLabel } from '@/utils/profiles';
import type { TargetRef } from '@/utils/targets';
import { router } from '@/routes';

/** Human label for a target, used in toasts and banners. */
export const describeTarget = ({ instanceId, profile }: TargetRef): string => {
  const instance = useInstancesStore
    .getState()
    .instances.find((candidate) => candidate.id === instanceId);
  return `${instance?.label ?? instanceId} · ${getProfileLabel(profile)}`;
};

/** Exported so the coordinate export uses exactly what the requests use. */
export const getActiveWaypoints = (waypoints: Waypoint[]): ActiveWaypoint[] =>
  waypoints.flatMap((wp) => wp.geocodeResults.filter((r) => r.selected));

async function fetchDirectionsForTarget(
  target: TargetRef,
  activeWaypoints: ActiveWaypoint[]
): Promise<ParsedDirectionsGeometry> {
  const { dateTime, perTarget, excludePolygons } = useCommonStore.getState();
  const settings = buildCostingOptions(
    target.profile,
    getTargetScope(perTarget, target),
    excludePolygons
  );
  const language = getDirectionsLanguage();

  const valhallaRequest = buildDirectionsRequest({
    profile: target.profile,
    activeWaypoints,
    // @ts-expect-error todo: initial settings and filtered settings types mismatch
    settings,
    dateTime,
    language,
  });
  const params = new URLSearchParams({
    json: JSON.stringify(valhallaRequest.json),
  });

  const response = await fetch(
    `${getInstanceUrl(target.instanceId)}/route?${params.toString()}`,
    {
      headers: {
        'Content-Type': 'application/json',
        ...VALHALLA_CLIENT_HEADERS,
      },
    }
  );

  if (!response.ok) {
    const errorData: { error_code?: number; error?: string } | null =
      await response.json().catch(() => null);
    const classified = classifyValhallaError(
      errorData,
      'Could not fetch resource'
    );

    // Append context for route-specific error
    if (errorData?.error_code === 154) {
      classified.message += ` for route.`;
    }

    throw new ValhallaError(classified);
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

  showValhallaWarnings(data.trip.warnings, describeTarget(target));

  return data as ParsedDirectionsGeometry;
}

/**
 * Routes every selected target — one costing profile on one Valhalla instance —
 * between the same waypoints. Targets are requested concurrently and settled
 * independently, so a server that lacks a costing model doesn't hide the ones
 * that answered.
 */
async function fetchDirections(): Promise<{
  results: TargetRouteResult[];
  failures: TargetFailure[];
} | null> {
  const waypoints = useDirectionsStore.getState().waypoints;
  const targets = readSelectedTargets(router.state.location.search.profile);

  const activeWaypoints = getActiveWaypoints(waypoints);
  if (activeWaypoints.length < 2) {
    return null;
  }

  const settled = await Promise.allSettled(
    targets.map((target) => fetchDirectionsForTarget(target, activeWaypoints))
  );

  const results: TargetRouteResult[] = [];
  const failures: TargetFailure[] = [];

  // Positional correspondence with `targets` is what attributes each failure to
  // the right instance — keep the index, don't re-derive it from the outcome.
  settled.forEach((outcome, i) => {
    const target = targets[i]!;
    if (outcome.status === 'fulfilled') {
      results.push({ target, data: outcome.value });
    } else {
      const { kind, message } = toRequestError(
        outcome.reason,
        'Could not fetch resource'
      );
      failures.push({ target, kind, message });
    }
  });

  // An unsupported costing model gets an inline banner in the results list, so
  // only genuine errors are worth interrupting with a toast.
  const errors = failures.filter((failure) => failure.kind === 'error');
  if (errors.length > 0) {
    toast.warning(
      results.length === 0
        ? 'No routes could be calculated'
        : 'Some targets returned no route',
      {
        description: errors
          .map(
            (failure) => `${describeTarget(failure.target)}: ${failure.message}`
          )
          .join('\n'),
        position: 'bottom-center',
        duration: 5000,
        closeButton: true,
      }
    );
  }

  return { results, failures };
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
        const outcome = await fetchDirections();
        if (outcome) {
          receiveRouteResults(outcome);
          // Fit every target's route, not just the first one.
          zoomTo(
            outcome.results.flatMap((result) => result.data.decodedGeometry)
          );
        }
        return outcome;
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
