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
import { useTraceAttributesQuery } from '@/hooks/use-trace-attributes-query';
import type { EdgeSegment } from '@/utils/trace-attributes';
import type { Feature, FeatureCollection, LineString } from 'geojson';

export const SEGMENT_METRICS_LAYER_ID = 'route-segment-metrics';
export const SEGMENT_METRICS_HIT_LAYER_ID = 'route-segment-metrics-hit';
export const TRANSITION_NODES_LAYER_ID = 'route-transition-nodes';
export const TRANSITION_NODES_HIT_LAYER_ID = 'route-transition-nodes-hit';

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

  // Graph edges when the trace came back, maneuvers until then — the trace is
  // a second request, so the coarse view draws immediately and sharpens.
  const showIntersections = useDirectionsStore(
    (state) => state.showIntersectionCosts
  );
  const { data: traced } = useTraceAttributesQuery(
    segmentMetric ? activeRoute : null
  );
  const edgeSegments = traced?.segments;

  const data = useMemo(() => {
    if (!successful || !segmentMetric || !activeRoute) return null;

    const route = getRouteAt(results.byTarget, activeRoute);
    if (!route?.trip) return null;

    const metric = getSegmentMetric(segmentMetric);
    const segments =
      edgeSegments && edgeSegments.length > 0
        ? edgeSegments
        : toRouteSegments(route);
    if (segments.length === 0) return null;

    const values = segments.map((segment) => metric.value(segment));
    const [low, high] = rampDomain(values);
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
          // Present only in the per-edge view; the popup hides what is absent.
          edgeId: (segment as EdgeSegment).edgeId ?? null,
          wayId: (segment as EdgeSegment).wayId ?? null,
          roadClass: (segment as EdgeSegment).roadClass ?? null,
          speed: (segment as EdgeSegment).speed ?? null,
          transitionTime: (segment as EdgeSegment).transitionTime ?? null,
          transitionCost: (segment as EdgeSegment).transitionCost ?? null,
        },
      };
    });

    return { type: 'FeatureCollection', features } as FeatureCollection;
  }, [results, activeRoute, segmentMetric, successful, edgeSegments]);

  const nodeData = useMemo(() => {
    const nodes = traced?.nodes;
    if (!segmentMetric || !showIntersections || !nodes || nodes.length === 0) {
      return null;
    }

    // Junctions are scaled against each other, not against the road segments:
    // a turn penalty and a cost-per-kilometre are not the same quantity.
    const costs = nodes.map((node) => node.cost);
    const highest = Math.max(...costs);

    return {
      type: 'FeatureCollection',
      features: nodes.map((node) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: node.coordinate },
        properties: {
          cost: node.cost,
          seconds: node.seconds,
          intoStreets: node.intoStreets.join(', '),
          intoRoadClass: node.intoRoadClass ?? null,
          fromWayId: node.fromWayId ?? null,
          intoWayId: node.intoWayId ?? null,
          nodeType: node.nodeType ?? null,
          trafficSignal: node.trafficSignal,
          lng: node.coordinate[0],
          lat: node.coordinate[1],
          share: highest > 0 ? node.cost / highest : 0,
        },
      })),
    } as FeatureCollection;
  }, [traced, segmentMetric, showIntersections]);

  if (!data) return null;

  const segmentSource = (
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

  if (!nodeData) return segmentSource;

  return (
    <>
      {segmentSource}
      <Source id="route-transitions" type="geojson" data={nodeData}>
        {/* Radius carries the magnitude so a costly junction is visible at
            route zoom; the fill repeats the ramp for a second read. */}
        <Layer
          id={TRANSITION_NODES_LAYER_ID}
          type="circle"
          paint={{
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['get', 'share'],
              0,
              4,
              1,
              11,
            ],
            'circle-color': [
              'interpolate',
              ['linear'],
              ['get', 'share'],
              0,
              RAMP_STOPS[0]!,
              1,
              RAMP_STOPS[RAMP_STOPS.length - 1]!,
            ],
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 1.5,
            'circle-opacity': 0.95,
          }}
        />
        {/* Same trick as the line: a wider invisible circle so a junction can
            be clicked without hitting the dot dead centre. It tracks the
            visible radius rather than sitting at a flat maximum — a route has
            around a hundred junctions, and fat hit areas on the cheap ones
            swallow every click meant for the road between them. */}
        <Layer
          id={TRANSITION_NODES_HIT_LAYER_ID}
          type="circle"
          paint={{
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['get', 'share'],
              0,
              6,
              1,
              14,
            ],
            'circle-opacity': 0,
          }}
        />
      </Source>
    </>
  );
}
