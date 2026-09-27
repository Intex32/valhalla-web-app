import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import { useDirectionsStore, getRouteAt } from '@/stores/directions-store';
import { getPaletteColor } from '@/utils/isochrone-palettes';
import {
  RAMP_STOPS,
  getSegmentMetric,
  toRouteSegments,
} from '@/utils/segment-metrics';
import {
  useSegmentMetricsStore,
  getSegmentRange,
  rangePosition,
  type MetricRange,
} from '@/stores/segment-metrics-store';
import { useTraceAttributesQuery } from '@/hooks/use-trace-attributes-query';
import type { EdgeSegment } from '@/utils/trace-attributes';
import type { Feature, FeatureCollection, LineString } from 'geojson';

export const SEGMENT_METRICS_LAYER_ID = 'route-segment-metrics';
export const SEGMENT_METRICS_HIT_LAYER_ID = 'route-segment-metrics-hit';
export const TRANSITION_NODES_LAYER_ID = 'route-transition-nodes';
export const TRANSITION_NODES_HIT_LAYER_ID = 'route-transition-nodes-hit';

/** Ring colours for a junction whose value falls outside its scale. */
const OFF_SCALE_STROKE = {
  // Deliberately not red: red is the ramp's hot end and would read as another
  // value rather than as "this dot is pinned at an end".
  above: '#111827',
  below: '#94a3b8',
  in: '#ffffff',
} as const;

type OffScale = keyof typeof OFF_SCALE_STROKE;

const offScaleOf = (value: number, range: MetricRange | null): OffScale => {
  if (range === null) return 'in';
  if (value > range.max) return 'above';
  if (value < range.min) return 'below';
  return 'in';
};

/**
 * Paints the selected route one maneuver at a time, coloured by a normalised
 * metric. Only ever the selected route: overlaying every alternate would make
 * the ramp meaningless, since each route would be scaled against its own
 * extremes.
 */
export function RouteSegmentMetrics() {
  const results = useDirectionsStore((state) => state.results);
  const activeRoute = useDirectionsStore((state) => state.activeRoute);
  const segmentMetric = useSegmentMetricsStore((state) => state.segmentMetric);
  const successful = useDirectionsStore((state) => state.successful);

  // Graph edges when the trace came back, maneuvers until then — the trace is
  // a second request, so the coarse view draws immediately and sharpens.
  const showIntersections = useSegmentMetricsStore(
    (state) => state.showIntersectionCosts
  );
  const segmentRanges = useSegmentMetricsStore((state) => state.segmentRanges);
  const nodeRanges = useSegmentMetricsStore((state) => state.nodeRanges);
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

    // Absolute bounds, not the route's own extremes: the same value has to
    // mean the same colour on every route, or there is no intuition to build.
    const range = getSegmentRange(segmentRanges, segmentMetric);

    const features: Feature<LineString>[] = segments.map((segment) => {
      const value = metric.value(segment);
      const t = rangePosition(value, range);
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
  }, [
    results,
    activeRoute,
    segmentMetric,
    successful,
    edgeSegments,
    segmentRanges,
  ]);

  // Which junction quantity, if any, the current metric pairs with.
  const encoding = segmentMetric
    ? getSegmentMetric(segmentMetric).intersection
    : 'none';

  const nodeData = useMemo(() => {
    const nodes = traced?.nodes;
    if (!segmentMetric || !showIntersections || !nodes || nodes.length === 0) {
      return null;
    }

    const nodeRange = encoding === 'none' ? null : nodeRanges[encoding];
    // A half-typed bound can collapse the range; treat that as "everything is
    // in scale" rather than ringing every junction on the route at once.
    const rangeUsable = nodeRange !== null && nodeRange.max > nodeRange.min;

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
          // Junctions have their own absolute bounds: a turn penalty and a
          // cost-per-kilometre are not the same quantity. Cost pairs with
          // cost/km, seconds with time/km — both rise as the journey worsens.
          share:
            nodeRange === null
              ? 0
              : rangePosition(
                  encoding === 'time' ? node.seconds : node.cost,
                  nodeRange
                ),
          // Dot size clamps at the ends of the scale, so two junctions far
          // apart in value can draw identically. The outline says which ones
          // are pinned rather than measured.
          offScale: offScaleOf(
            encoding === 'time' ? node.seconds : node.cost,
            rangeUsable ? nodeRange : null
          ),
        },
      })),
    } as FeatureCollection;
  }, [traced, segmentMetric, showIntersections, nodeRanges, encoding]);

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
        {/* When the metric has a junction equivalent, radius carries the
            magnitude so a costly one is visible at route zoom and the fill
            repeats the ramp for a second read. When it has none, the dots are
            uniform and neutral — present and clickable, but claiming nothing
            about a quantity they cannot express. */}
        <Layer
          id={TRANSITION_NODES_LAYER_ID}
          type="circle"
          paint={
            encoding === 'none'
              ? {
                  'circle-radius': 5,
                  'circle-color': '#475569',
                  'circle-stroke-color': '#fff',
                  'circle-stroke-width': 2,
                  'circle-opacity': 0.9,
                }
              : {
                  // The floor matters: the road line under these dots is 7px
                  // wide, so anything smaller than about 6 disappears into it.
                  'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['get', 'share'],
                    0,
                    6,
                    1,
                    14,
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
                  // The ring is the off-scale cue; it also thickens, since a
                  // colour change alone on a 2px ring is easy to miss.
                  'circle-stroke-color': [
                    'match',
                    ['get', 'offScale'],
                    'above',
                    OFF_SCALE_STROKE.above,
                    'below',
                    OFF_SCALE_STROKE.below,
                    OFF_SCALE_STROKE.in,
                  ],
                  'circle-stroke-width': [
                    'match',
                    ['get', 'offScale'],
                    'in',
                    2,
                    3,
                  ],
                  'circle-opacity': 0.95,
                }
          }
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
              8,
              1,
              16,
            ],
            'circle-opacity': 0,
          }}
        />
      </Source>
    </>
  );
}
