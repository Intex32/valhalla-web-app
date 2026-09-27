import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import {
  SEGMENT_METRICS,
  type IntersectionEncoding,
  type SegmentMetricId,
} from '@/utils/segment-metrics';

const STORAGE_KEY = 'valhalla_segment_metrics';

export interface MetricRange {
  min: number;
  max: number;
}

/**
 * The value a colour ramp spans, per metric, in the metric's own unit.
 *
 * These are deliberately **absolute**, not derived from the route being
 * looked at. A per-route scale re-anchors itself every time the route changes,
 * so the same road flips colour between two runs and nothing can be compared
 * across routes. Fixed bounds cost some contrast on any single route and buy
 * an intuition that holds still.
 *
 * The defaults below are round numbers chosen around what a 13 km mixed urban
 * and ring-road route actually produces, with headroom at both ends. They are
 * starting points, not truths — the panel edits them and the edits persist.
 */
export const DEFAULT_SEGMENT_RANGES: Record<SegmentMetricId, MetricRange> = {
  // Observed 61–141 on that route; this band keeps urban and motorway apart
  // without either pinning to an end.
  cost_per_km: { min: 50, max: 150 },
  // 30 s/km is 120 km/h, 180 s/km is 20 km/h — the usable range of a vehicle.
  time_per_km: { min: 30, max: 180 },
  // The natural absolute scale for a speed; no need to invent one.
  speed: { min: 0, max: 130 },
  // 1 means cost tracks time exactly, which is what an unremarkable road does.
  // Anything approaching 3 is carrying serious penalties.
  cost_per_second: { min: 1, max: 3 },
};

/**
 * Junctions get their own bounds, one per quantity they can encode: a
 * transition is a cost (or a delay) at a point, in no way comparable to a cost
 * per kilometre, so they must never share a scale with the road segments.
 *
 * Both distributions are heavily skewed. Junction **cost** on the reference
 * route has a median of 1.9 and a 90th percentile of 11.4 against a maximum of
 * 33.5 — spanning to that maximum pushed two thirds of the dots under 0.1 of
 * the ramp, where they vanish into the road beneath them, so the default ends
 * at 15 and lets the expensive handful clamp.
 *
 * Junction **time** is sharper still: the median transition costs 0.017 s and
 * the 90th percentile 0.107 s, with a tail at 2–5.6 s for traffic signals and
 * real manoeuvres. Ending at 3 s means the ordinary turns all sit near the
 * bottom — which is honest, since they genuinely cost no time — and the
 * junctions that do delay the journey stand out.
 */
export const DEFAULT_NODE_COST_RANGE: MetricRange = { min: 0, max: 15 };
export const DEFAULT_NODE_TIME_RANGE: MetricRange = { min: 0, max: 3 };

/** The quantity a junction dot encodes, and the scale that measures it. */
export type NodeRangeKind = Exclude<IntersectionEncoding, 'none'>;

export const DEFAULT_NODE_RANGES: Record<NodeRangeKind, MetricRange> = {
  cost: DEFAULT_NODE_COST_RANGE,
  time: DEFAULT_NODE_TIME_RANGE,
};

interface SegmentMetricsState {
  /** Which metric paints the selected route, or null for the plain line. */
  segmentMetric: SegmentMetricId | null;
  showIntersectionCosts: boolean;
  segmentRanges: Record<SegmentMetricId, MetricRange>;
  nodeRanges: Record<NodeRangeKind, MetricRange>;
}

interface SegmentMetricsActions {
  setSegmentMetric: (metric: SegmentMetricId | null) => void;
  setShowIntersectionCosts: (show: boolean) => void;
  setSegmentRange: (
    metric: SegmentMetricId,
    range: Partial<MetricRange>
  ) => void;
  setNodeRange: (kind: NodeRangeKind, range: Partial<MetricRange>) => void;
  resetRanges: () => void;
}

type SegmentMetricsStore = SegmentMetricsState & SegmentMetricsActions;

/**
 * The segment-metrics debugging view: which metric is painted, whether
 * junctions show, and the absolute bounds each scale spans. Persisted, because
 * a scale that resets on reload defeats the point of a fixed one.
 */
export const useSegmentMetricsStore = create<SegmentMetricsStore>()(
  devtools(
    persist(
      immer((set) => ({
        segmentMetric: null,
        showIntersectionCosts: true,
        segmentRanges: { ...DEFAULT_SEGMENT_RANGES },
        nodeRanges: {
          cost: { ...DEFAULT_NODE_COST_RANGE },
          time: { ...DEFAULT_NODE_TIME_RANGE },
        },

        setSegmentMetric: (metric) =>
          set(
            (state) => {
              state.segmentMetric = metric;
            },
            undefined,
            'setSegmentMetric'
          ),

        setShowIntersectionCosts: (show) =>
          set(
            (state) => {
              state.showIntersectionCosts = show;
            },
            undefined,
            'setShowIntersectionCosts'
          ),

        setSegmentRange: (metric, range) =>
          set(
            (state) => {
              const current =
                state.segmentRanges[metric] ?? DEFAULT_SEGMENT_RANGES[metric];
              state.segmentRanges[metric] = { ...current, ...range };
            },
            undefined,
            'setSegmentRange'
          ),

        setNodeRange: (kind, range) =>
          set(
            (state) => {
              const current =
                state.nodeRanges[kind] ?? DEFAULT_NODE_RANGES[kind];
              state.nodeRanges[kind] = { ...current, ...range };
            },
            undefined,
            'setNodeRange'
          ),

        resetRanges: () =>
          set(
            (state) => {
              state.segmentRanges = { ...DEFAULT_SEGMENT_RANGES };
              state.nodeRanges = {
                cost: { ...DEFAULT_NODE_COST_RANGE },
                time: { ...DEFAULT_NODE_TIME_RANGE },
              };
            },
            undefined,
            'resetRanges'
          ),
      })),
      {
        name: STORAGE_KEY,
        // Bumped when a default range changes: the stored value would
        // otherwise win forever and nobody would see the new one. Ranges are
        // cheap to re-tune, so a migration just drops them back to defaults.
        version: 2,
        migrate: (persisted) => ({
          ...(persisted as Partial<SegmentMetricsState>),
          segmentRanges: { ...DEFAULT_SEGMENT_RANGES },
          nodeRanges: {
            cost: { ...DEFAULT_NODE_COST_RANGE },
            time: { ...DEFAULT_NODE_TIME_RANGE },
          },
        }),
        // A metric added after someone's ranges were stored would otherwise be
        // missing from the persisted map and read as undefined.
        merge: (persisted, current) => {
          const saved = (persisted ?? {}) as Partial<SegmentMetricsState>;
          return {
            ...current,
            ...saved,
            segmentRanges: {
              ...DEFAULT_SEGMENT_RANGES,
              ...(saved.segmentRanges ?? {}),
            },
            nodeRanges: {
              cost: {
                ...DEFAULT_NODE_COST_RANGE,
                ...(saved.nodeRanges?.cost ?? {}),
              },
              time: {
                ...DEFAULT_NODE_TIME_RANGE,
                ...(saved.nodeRanges?.time ?? {}),
              },
            },
          };
        },
      }
    ),
    { name: 'segment-metrics' }
  )
);

/**
 * Where `value` sits in `range`, as 0–1. Values outside the bounds clamp, so
 * an extreme segment still paints — at the end of the scale rather than
 * redefining it.
 */
export const rangePosition = (value: number, range: MetricRange): number => {
  const span = range.max - range.min;
  // A collapsed range would divide by zero; paint the middle instead.
  if (span <= 0) return 0.5;
  return Math.min(1, Math.max(0, (value - range.min) / span));
};

export const getSegmentRange = (
  ranges: Record<SegmentMetricId, MetricRange>,
  metric: SegmentMetricId
): MetricRange => ranges[metric] ?? DEFAULT_SEGMENT_RANGES[metric];

/** Exported for the panel, which renders one range editor per metric. */
export const SEGMENT_METRIC_IDS = SEGMENT_METRICS.map((metric) => metric.id);
