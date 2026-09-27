import type { Maneuver, ParsedDirectionsGeometry } from '@/components/types';

/**
 * Per-segment debugging metrics.
 *
 * Valhalla reports `cost`, `time` and `length` per maneuver — that is the
 * finest granularity a `/route` response carries. (`trace_attributes` returns
 * true per-edge attributes but no cost at all, so a second request would buy
 * detail on everything except the number we care about.) A maneuver therefore
 * *is* the road segment here: one stretch of road until the next turn.
 *
 * Every metric is normalised, because raw cost and time only say "this segment
 * was long". Dividing by length is what makes a short, heavily penalised
 * stretch stand out against a long cheap one.
 */
export type SegmentMetricId =
  | 'cost_per_km'
  | 'time_per_km'
  | 'speed'
  | 'cost_per_second';

/**
 * What the junction dots encode while a metric is shown.
 *
 * A transition is a cost charged at a point — it has no length, so most of the
 * segment metrics have no junction equivalent at all. Only the two that share
 * a direction with a junction quantity get one: cost/km pairs with transition
 * cost, and time/km with transition time (higher means a slower journey in
 * both cases). For the rest the dots stay plain: still there, still clickable,
 * just not pretending to carry a value.
 */
export type IntersectionEncoding = 'cost' | 'time' | 'none';

export interface SegmentMetric {
  id: SegmentMetricId;
  intersection: IntersectionEncoding;
  label: string;
  unit: string;
  description: string;
  /** Higher values take the hot end of the ramp, whatever "high" means here. */
  value: (segment: RouteSegment) => number;
  format: (value: number) => string;
}

export interface RouteSegment {
  index: number;
  /** Street names, as Valhalla spells them; empty for unnamed roads. */
  streets: string[];
  instruction: string;
  /** Kilometres, straight from the maneuver. */
  length: number;
  /** Seconds. */
  time: number;
  cost: number;
  /** [lng, lat] pairs, ready for GeoJSON. */
  coordinates: number[][];
}

const perKm = (value: number, length: number) =>
  length > 0 ? value / length : 0;

export const SEGMENT_METRICS: SegmentMetric[] = [
  {
    id: 'cost_per_km',
    intersection: 'cost',
    label: 'Cost / km',
    unit: 'cost/km',
    description:
      'Costing-model cost per kilometre. The headline number: it shows which stretches the costing model dislikes, regardless of how long they are.',
    value: (segment) => perKm(segment.cost, segment.length),
    format: (value) => value.toFixed(1),
  },
  {
    id: 'time_per_km',
    intersection: 'time',
    label: 'Time / km',
    unit: 's/km',
    description:
      'Seconds per kilometre — how slow the segment is, before any penalty is applied.',
    value: (segment) => perKm(segment.time, segment.length),
    format: (value) => value.toFixed(1),
  },
  {
    id: 'speed',
    intersection: 'none',
    label: 'Speed',
    unit: 'km/h',
    description:
      'Implied speed, length over time. The same information as time/km, in the unit the road is signed in.',
    value: (segment) =>
      segment.time > 0 ? segment.length / (segment.time / 3600) : 0,
    format: (value) => value.toFixed(1),
  },
  {
    id: 'cost_per_second',
    intersection: 'none',
    label: 'Cost / time',
    unit: 'cost/s',
    description:
      'Cost divided by time. Cost tracks time closely on an unremarkable road, so anything well above 1 is a segment carrying penalties — gates, turns, wrong-way stretches — rather than one that is merely slow.',
    value: (segment) => (segment.time > 0 ? segment.cost / segment.time : 0),
    format: (value) => value.toFixed(2),
  },
];

export const getSegmentMetric = (id: SegmentMetricId): SegmentMetric =>
  SEGMENT_METRICS.find((metric) => metric.id === id) ?? SEGMENT_METRICS[0]!;

/**
 * Cuts a route's shape into one feature-ready piece per maneuver.
 *
 * The last maneuver of a leg is Valhalla's zero-length arrival marker, and a
 * leg's final shape index is the next leg's first, so both are skipped rather
 * than drawn as degenerate segments.
 */
export const toRouteSegments = (
  route: ParsedDirectionsGeometry
): RouteSegment[] => {
  // `decodedGeometry` is [lat, lng]; GeoJSON wants the other order.
  const shape = route.decodedGeometry.map((point) => [
    point[1] ?? 0,
    point[0] ?? 0,
  ]);
  const segments: RouteSegment[] = [];

  const push = (maneuver: Maneuver) => {
    const coordinates = shape.slice(
      maneuver.begin_shape_index,
      maneuver.end_shape_index + 1
    );
    if (coordinates.length < 2) return;

    segments.push({
      index: segments.length,
      streets: maneuver.street_names ?? maneuver.begin_street_names ?? [],
      instruction: maneuver.instruction,
      length: maneuver.length,
      time: maneuver.time,
      cost: maneuver.cost,
      coordinates,
    });
  };

  for (const leg of route.trip.legs) {
    for (const maneuver of leg.maneuvers) push(maneuver);
  }

  return segments;
};

/**
 * Colour ramp for a normalised value: blue where cheap, red where expensive.
 *
 * Interpolation is linear in RGB, so the midpoint of a bare blue-to-red ramp
 * lands on a muddy violet. The two intermediate stops keep the path light and
 * saturated instead, while every colour on it still reads as blue, red, or a
 * blend of the two.
 */
export const RAMP_STOPS = ['#2c7bb6', '#8ab8dc', '#e3a0a8', '#d7191c'];
