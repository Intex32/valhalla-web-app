import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useDirectionsStore } from '@/stores/directions-store';
import {
  getValhallaUrl,
  buildOptimizedRouteRequest,
  parseDirectionsGeometry,
  showValhallaWarnings,
  VALHALLA_CLIENT_HEADERS,
} from '@/utils/valhalla';
import { buildCostingOptions } from '@/utils/build-costing-options';
import { getPrimaryProfile, parseProfilesWithFallback } from '@/utils/profiles';
import { useDirectionsQuery } from '@/hooks/use-directions-queries';
import { useCommonStore } from '@/stores/common-store';
import { router } from '@/routes';
import type { ValhallaOptimizedRouteResponse } from '@/components/types';
import type { Waypoint } from '@/stores/directions-store';
import { getDirectionsLanguage } from '@/utils/directions-language';

export function useOptimizedRouteQuery() {
  const waypoints = useDirectionsStore((state) => state.waypoints);
  const setWaypoint = useDirectionsStore((state) => state.setWaypoint);
  const receiveRouteResults = useDirectionsStore(
    (state) => state.receiveRouteResults
  );
  const setIsOptimized = useDirectionsStore((state) => state.setIsOptimized);
  const zoomTo = useCommonStore((state) => state.zoomTo);
  const { refetch: refetchDirections } = useDirectionsQuery();

  const mutation = useMutation({
    mutationFn: async () => {
      const relevantWaypoints: Waypoint[] = [];

      const activeWaypoints = waypoints.flatMap((wp) => {
        const selected = wp.geocodeResults.filter((r) => r.selected);
        if (selected.length > 0) {
          relevantWaypoints.push(wp);
        }
        return selected;
      });

      if (activeWaypoints.length < 4) {
        throw new Error('Not enough waypoints to optimize');
      }

      // Waypoint ordering is a single-route operation — it runs against the
      // primary profile even when several are selected for comparison.
      const profiles = parseProfilesWithFallback(
        router.state.location.search.profile
      );
      const profile = getPrimaryProfile(profiles);
      const { shared, perProfile } = useCommonStore.getState();
      const settings = buildCostingOptions(profile, { shared, perProfile });
      const language = getDirectionsLanguage();
      const request = buildOptimizedRouteRequest({
        profile,
        activeWaypoints,
        // @ts-expect-error todo: initial settings and filtered settings types mismatch
        settings,
        language,
      });
      const params = new URLSearchParams({
        json: JSON.stringify(request.json),
      });

      const response = await fetch(
        `${getValhallaUrl()}/optimized_route?${params}`,
        {
          headers: VALHALLA_CLIENT_HEADERS,
        }
      );

      if (!response.ok) {
        throw new Error(`Could not fetch resource`);
      }

      const data: ValhallaOptimizedRouteResponse = await response.json();

      const processedData = {
        ...data,
        id: data.id ?? 'valhalla_optimized_route',
        decodedGeometry: parseDirectionsGeometry(data),
      };

      showValhallaWarnings(data.trip.warnings);

      return {
        data: processedData,
        relevantWaypoints,
        profile,
        profileCount: profiles.length,
      };
    },
    onSuccess: ({ data, relevantWaypoints, profile, profileCount }) => {
      const newWaypoints: Waypoint[] = [];
      const locations = data.trip.locations;
      locations.forEach((loc) => {
        if (typeof loc.original_index === 'number') {
          const original = relevantWaypoints[loc.original_index];
          if (original) {
            newWaypoints.push(original);
          }
        }
      });
      setWaypoint(newWaypoints);
      setIsOptimized(true);
      receiveRouteResults({ results: [{ profile, data }] });
      zoomTo(data.decodedGeometry);
      toast.success('Route optimized successfully');

      // /optimized_route only answers for the primary profile. The others are
      // now stale against the reordered waypoints, so re-route them rather
      // than leaving the comparison silently reduced to one profile.
      if (profileCount > 1) {
        refetchDirections();
      }
    },
    onError: (error) => {
      console.error('Optimization error:', error);
      toast.error('Failed to optimize route');
    },
  });

  return {
    optimizeRoute: mutation.mutate,
    isPending: mutation.isPending,
  };
}
