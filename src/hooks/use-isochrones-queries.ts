import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import type {
  ActiveWaypoint,
  Center,
  ValhallaIsochroneResponse,
} from '@/components/types';
import {
  getValhallaUrl,
  buildIsochronesRequest,
  showValhallaWarnings,
  VALHALLA_CLIENT_HEADERS,
} from '@/utils/valhalla';
import {
  reverse_geocode,
  forward_geocode,
  parseGeocodeResponse,
} from '@/utils/nominatim';
import { buildCostingOptions } from '@/utils/build-costing-options';
import { calcArea } from '@/utils/geom';
import { useCommonStore, type Profile } from '@/stores/common-store';
import {
  useIsochronesStore,
  type ProfileIsochroneResult,
} from '@/stores/isochrones-store';
import { getProfileLabel, parseProfilesWithFallback } from '@/utils/profiles';
import { router } from '@/routes';

async function fetchIsochronesForProfile(
  profile: Profile,
  center: Center
): Promise<ValhallaIsochroneResponse> {
  const { maxRange, interval, denoise, generalize } =
    useIsochronesStore.getState();
  const { shared, perProfile } = useCommonStore.getState();
  const settings = buildCostingOptions(profile, { shared, perProfile });

  const valhallaRequest = buildIsochronesRequest({
    profile,
    center,
    // @ts-expect-error todo: initial settings and filtered settings types mismatch
    settings,
    maxRange,
    denoise,
    generalize,
    interval,
  });
  const params = new URLSearchParams({
    json: JSON.stringify(valhallaRequest.json),
  });

  const response = await fetch(`${getValhallaUrl()}/isochrone?${params}`, {
    headers: {
      'Content-Type': 'application/json',
      ...VALHALLA_CLIENT_HEADERS,
    },
  });

  if (!response.ok) {
    throw new Error('Could not fetch resource');
  }

  const data: ValhallaIsochroneResponse = await response.json();

  // Calculate area for each feature
  data.features.forEach((feature) => {
    if (feature.properties) {
      feature.properties.area = calcArea(feature);
    }
  });

  showValhallaWarnings(data.warnings);

  return data;
}

/** Requests contours around the same centre for every selected profile. */
async function fetchIsochrones(): Promise<ProfileIsochroneResult[] | null> {
  const { geocodeResults } = useIsochronesStore.getState();
  const profiles = parseProfilesWithFallback(
    router.state.location.search.profile
  );
  const center = geocodeResults.find((result) => result.selected);

  if (!center) {
    return null;
  }

  const settled = await Promise.allSettled(
    profiles.map((profile) =>
      fetchIsochronesForProfile(profile, center as Center)
    )
  );

  const results: ProfileIsochroneResult[] = [];
  const failures: string[] = [];

  settled.forEach((outcome, i) => {
    const profile = profiles[i]!;
    if (outcome.status === 'fulfilled') {
      results.push({ profile, data: outcome.value });
    } else {
      const reason =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : 'Failed to fetch isochrones';
      failures.push(`${getProfileLabel(profile)}: ${reason}`);
    }
  });

  if (failures.length > 0) {
    toast.warning(
      failures.length === profiles.length
        ? 'No isochrones could be calculated'
        : 'Some profiles returned no isochrone',
      {
        description: failures.join('\n'),
        position: 'bottom-center',
        duration: 5000,
        closeButton: true,
      }
    );
  }

  if (results.length === 0) {
    throw new Error(failures[0] ?? 'Failed to fetch isochrones');
  }

  return results;
}

export function useIsochronesQuery() {
  const showLoading = useCommonStore((state) => state.showLoading);
  const receiveIsochroneResults = useIsochronesStore(
    (state) => state.receiveIsochroneResults
  );

  return useQuery({
    queryKey: ['isochrones'],
    queryFn: async () => {
      showLoading(true);
      try {
        const results = await fetchIsochrones();
        if (results) {
          receiveIsochroneResults(results);
        }
        return results;
      } catch (error) {
        receiveIsochroneResults([]);
        throw error;
      } finally {
        setTimeout(() => showLoading(false), 500);
      }
    },
    enabled: false,
    retry: false,
  });
}

async function fetchReverseGeocode(lng: number, lat: number) {
  const response = await reverse_geocode(lng, lat);
  const addresses = parseGeocodeResponse(response.data, [lng, lat]);

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

export function useReverseGeocodeIsochrones() {
  const updateTextInput = useIsochronesStore((state) => state.updateTextInput);
  const receiveGeocodeResults = useIsochronesStore(
    (state) => state.receiveGeocodeResults
  );
  const zoomTo = useCommonStore((state) => state.zoomTo);

  const reverseGeocode = async (lng: number, lat: number) => {
    // Set placeholder immediately
    const placeholderAddresses: ActiveWaypoint[] = [
      {
        selected: true,
        title: '',
        displaylnglat: [lng, lat],
        sourcelnglat: [lng, lat],
        key: 0,
        addressindex: 0,
      },
    ];

    receiveGeocodeResults(placeholderAddresses);
    updateTextInput({
      userInput: `${lng.toFixed(6)}, ${lat.toFixed(6)}`,
      addressIndex: 0,
    });
    zoomTo([[lat, lng]]);

    try {
      const addresses = await fetchReverseGeocode(lng, lat);
      receiveGeocodeResults(addresses);
      updateTextInput({
        userInput: addresses[0]?.title || '',
        addressIndex: 0,
      });
      return addresses;
    } catch (error) {
      console.error('Reverse geocode error:', error);
      throw error;
    }
  };

  return { reverseGeocode };
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

export function useForwardGeocodeIsochrones() {
  const receiveGeocodeResults = useIsochronesStore(
    (state) => state.receiveGeocodeResults
  );

  const forwardGeocode = async (
    userInput: string,
    lngLat?: [number, number]
  ) => {
    try {
      const addresses = await fetchForwardGeocode(userInput, lngLat);
      receiveGeocodeResults(addresses);
      return addresses;
    } catch (error) {
      console.error('Forward geocode error:', error);
      throw error;
    }
  };

  return { forwardGeocode };
}
