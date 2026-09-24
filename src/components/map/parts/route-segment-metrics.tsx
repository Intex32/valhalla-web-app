import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import { useDirectionsStore, getRouteAt } from '@/stores/directions-store';
import { getPaletteColor } from '@/utils/isochrone-palettes';
import {
  RAMP_STOPS,
  getSegmentMetric,
  rampDomain,
  toRouteSegments,
} from '@/utils/segment-metrics';
import type { Feature, FeatureCollection, LineString } from 'geojson';

export const SEGMENT_METRICS_LAYER_ID = 'route-segment-metrics';
export const SEGMENT_METRICS_HIT_LAYER_ID = 'route-segment-metrics-hit';

/**
 * Paints the selected route one maneuver at a time, coloured by a normalised
 * metric. Only ever the selected route: overlaying every alternate would make
 * the ramp meaningless, since each route would be scaled against its own
 * extremes.
 */
export function RouteSegmentMetrics() {
  const results = useDirectionsStore((state) => state.results);
  const activeRoute = useDirectionsStore((state) => state.activeRoute);
  const segmentMetric = useDirectionsStore((state) => state.segmentMetric);
  const successful = useDirectionsStore((state) => state.successful);

  const data = useMemo(() => {
    if (!successful || !segmentMetric || !activeRoute) return null;

    const route = getRouteAt(results.byTarget, activeRoute);
    if (!route?.trip) return null;

    const metric = getSegmentMetric(segmentMetric);
    const segments = toRouteSegments(route);
    if (segments.length === 0) return null;

    const values = segments.map((segment) => metric.value(segment));
    const [low, high] = rampDomain(
      values,
      segments.map((segment) => segment.length)
    );
    // A route whose segments all score the same would divide by zero; paint it
    // in the middle of the ramp instead of at one extreme.
    const span = high - low;

    const features: Feature<LineString>[] = segments.map((segment, i) => {
      const value = values[i] ?? 0;
      // Values beyond the percentile range keep painting, pinned to the ends.
      const t = span > 0 ? Math.min(1, Math.max(0, (value - low) / span)) : 0.5;
      return {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: segment.coordinates },
        properties: {
          color: getPaletteColor(RAMP_STOPS, t),
          metricValue: value,
          segmentIndex: segment.index,
          streets: segment.streets.join(', '),
          instruction: segment.instruction,
          length: segment.length,
          time: segment.time,
          cost: segment.cost,
        },
      };
    });

    return { type: 'FeatureCollection', features } as FeatureCollection;
  }, [results, activeRoute, segmentMetric, successful]);

  if (!data) return null;

  return (
    <Source id="route-segments" type="geojson" data={data}>
      <Layer
        id={SEGMENT_METRICS_LAYER_ID}
        type="line"
        paint={{
          'line-color': ['get', 'color'],
          'line-width': 7,
          'line-opacity': 1,
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
      {/* Wider transparent stand-in, so a click lands on the segment without
          having to hit the 7px stroke exactly. */}
      <Layer
        id={SEGMENT_METRICS_HIT_LAYER_ID}
        type="line"
        paint={{ 'line-color': '#000', 'line-width': 18, 'line-opacity': 0 }}
      />
    </Source>
  );
}
