import { useQuery } from '@tanstack/react-query';

import { getInstanceUrl, VALHALLA_CLIENT_HEADERS } from '@/utils/valhalla';
import { buildCostingOptions } from '@/utils/build-costing-options';
import { useCommonStore, getTargetScope } from '@/stores/common-store';
import {
  useDirectionsStore,
  getRouteAt,
  type RouteRef,
} from '@/stores/directions-store';
import {
  buildTraceAttributesRequest,
  toTraceSegments,
  type EdgeSegment,
  type TraceAttributesResponse,
  type TransitionNode,
} from '@/utils/trace-attributes';

interface TraceResult {
  segments: EdgeSegment[];
  nodes: TransitionNode[];
}

/**
 * Per-edge costs for the selected route, from a second `/trace_attributes`
 * request that walks the route's own shape.
 *
 * Only ever fired for the selected route, and only while the segment-metrics
 * view is on — it is a debugging aid that doubles the requests per route, so
 * it stays off the normal path.
 */
export const useTraceAttributesQuery = (active: RouteRef | null) => {
  const results = useDirectionsStore((state) => state.results);
  const route = active ? getRouteAt(results.byTarget, active) : null;
  // The route response carries one shape per leg; the trace walks them one leg
  // at a time, so multi-leg routes fall back to maneuver granularity for now.
  const shape =
    route?.trip.legs.length === 1 ? route.trip.legs[0]?.shape : null;

  // Settings belong in the key: a costing change that leaves the geometry
  // alone still changes the costs, and the shape alone would not notice.
  const perTarget = useCommonStore((state) => state.perTarget);
  const scopeKey = active
    ? JSON.stringify(getTargetScope(perTarget, active))
    : null;

  return useQuery<TraceResult>({
    queryKey: ['trace-attributes', active, shape, scopeKey],
    enabled: Boolean(active && shape),
    queryFn: async () => {
      if (!active || !shape) return { segments: [], nodes: [] };

      const { perTarget, excludePolygons } = useCommonStore.getState();
      const settings = buildCostingOptions(
        active.profile,
        getTargetScope(perTarget, active),
        excludePolygons
      );

      const response = await fetch(
        `${getInstanceUrl(active.instanceId)}/trace_attributes`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...VALHALLA_CLIENT_HEADERS,
          },
          body: JSON.stringify(
            buildTraceAttributesRequest({
              shape,
              profile: active.profile,
              // Must match the route request, or the costs drift.
              costingOptions: settings.costing,
            })
          ),
        }
      );

      if (!response.ok) return { segments: [], nodes: [] };

      const traced = (await response.json()) as TraceAttributesResponse;
      return toTraceSegments(traced);
    },
  });
};
