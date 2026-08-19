import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import type {
  ActiveWaypoint,
  Center,
  ValhallaIsochroneResponse,
} from '@/components/types';
import {
  getInstanceUrl,
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
import {
  classifyValhallaError,
  toRequestError,
  ValhallaError,
} from '@/utils/valhalla-errors';
import { calcArea } from '@/utils/geom';
import { useCommonStore, getTargetScope } from '@/stores/common-store';
import {
  useIsochronesStore,
  type TargetIsochroneFailure,
  type TargetIsochroneResult,
} from '@/stores/isochrones-store';
import { readSelectedTargets } from '@/hooks/use-selected-targets';
import { describeTarget } from '@/hooks/use-directions-queries';
import type { TargetRef } from '@/utils/targets';
import { router } from '@/routes';

async function fetchIsochronesForTarget(
  target: TargetRef,
  center: Center
): Promise<ValhallaIsochroneResponse> {
  const { maxRange, interval, denoise, generalize } =
    useIsochronesStore.getState();
  const { perTarget, excludePolygons } = useCommonStore.getState();
  const settings = buildCostingOptions(
    target.profile,
    getTargetScope(perTarget, target),
    excludePolygons
  );

  const valhallaRequest = buildIsochronesRequest({
    profile: target.profile,
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

  const response = await fetch(
    `${getInstanceUrl(target.instanceId)}/isochrone?${params.toString()}`,
    {
      headers: {
        'Content-Type': 'application/json',
        ...VALHALLA_CLIENT_HEADERS,
      },
    }
  );

  if (!response.ok) {
    // The body has to be read here, not swallowed: error_code 125 is what
    // distinguishes "this server has no such profile" from a real failure.
    const errorData: { error_code?: number; error?: string } | null =
      await response.json().catch(() => null);
    throw new ValhallaError(
      classifyValhallaError(errorData, 'Could not fetch resource')
    );
  }

  const data: ValhallaIsochroneResponse = await response.json();

  // Calculate area for each feature
  data.features.forEach((feature) => {
    if (feature.properties) {
      feature.properties.area = calcArea(feature);
    }
  });

  showValhallaWarnings(data.warnings, describeTarget(target));

  return data;
}

/** Requests contours around the same centre for every selected target. */
async function fetchIsochrones(): Promise<{
  results: TargetIsochroneResult[];
  failures: TargetIsochroneFailure[];
} | null> {
  const { geocodeResults } = useIsochronesStore.getState();
  const targets = readSelectedTargets(router.state.location.search.profile);
  const center = geocodeResults.find((result) => result.selected);

  if (!center) {
    return null;
  }

  const settled = await Promise.allSettled(
    targets.map((target) => fetchIsochronesForTarget(target, center as Center))
  );

  const results: TargetIsochroneResult[] = [];
  const failures: TargetIsochroneFailure[] = [];

  settled.forEach((outcome, i) => {
    const target = targets[i]!;
    if (outcome.status === 'fulfilled') {
      results.push({ target, data: outcome.value });
    } else {
      const { kind, message } = toRequestError(
        outcome.reason,
        'Failed to fetch isochrones'
      );
      failures.push({ target, kind, message });
    }
  });

  const errors = failures.filter((failure) => failure.kind === 'error');
  if (errors.length > 0) {
    toast.warning(
      results.length === 0
        ? 'No isochrones could be calculated'
        : 'Some targets returned no isochrone',
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
        const outcome = await fetchIsochrones();
        if (outcome) {
          receiveIsochroneResults(outcome);
        }
        return outcome;
      } catch (error) {
        receiveIsochroneResults({ results: [], failures: [] });
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
