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

export interface SegmentMetric {
  id: SegmentMetricId;
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
    label: 'Cost / km',
    unit: 'cost/km',
    description:
      'Costing-model cost per kilometre. The headline number: it shows which stretches the costing model dislikes, regardless of how long they are.',
    value: (segment) => perKm(segment.cost, segment.length),
    format: (value) => value.toFixed(1),
  },
  {
    id: 'time_per_km',
    label: 'Time / km',
    unit: 's/km',
    description:
      'Seconds per kilometre — how slow the segment is, before any penalty is applied.',
    value: (segment) => perKm(segment.time, segment.length),
    format: (value) => value.toFixed(1),
  },
  {
    id: 'speed',
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

/** Stubs shorter than this, in km, do not get to define the ramp's ends. */
const MIN_RAMP_LENGTH_KM = 0.05;
/** …nor do segments shorter than this share of the route. */
const MIN_RAMP_LENGTH_SHARE = 0.02;

/**
 * The value range the colour ramp spans.
 *
 * A route's last maneuver is typically a stub of a few dozen metres carrying
 * the fixed cost of arriving — 41 m at 341 cost/km where the rest of the route
 * sits between 61 and 214. Every per-km metric explodes on a segment that
 * short, so a plain min/max let the tail define the top of the scale on every
 * route and squashed the real variation into the bottom half of the ramp.
 *
 * Stubs are therefore excluded from the ends of the scale, but still painted:
 * values outside the range clamp to the extremes, so the arrival stub stays
 * red — it just no longer decides what red means.
 */
export const rampDomain = (
  values: number[],
  lengths: number[]
): [number, number] => {
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const floor = Math.max(MIN_RAMP_LENGTH_KM, total * MIN_RAMP_LENGTH_SHARE);

  const substantial = values.filter(
    (_, index) => (lengths[index] ?? 0) >= floor
  );
  // A route made entirely of stubs has nothing left to scale against.
  const scale = substantial.length >= 2 ? substantial : values;

  return [Math.min(...scale), Math.max(...scale)];
};

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
