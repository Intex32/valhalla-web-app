import { decode } from './polyline';
import type { Profile } from '@/stores/common-store';
import type { RouteSegment } from './segment-metrics';

/**
 * Per-edge costs for an already-computed route.
 *
 * A `/route` response only carries cost per maneuver — a whole stretch of road
 * until the next turn. Walking that route's own shape back through
 * `/trace_attributes` with `shape_match: 'edge_walk'` returns the same path
 * split into graph edges (314 of them where the route had 10 maneuvers), each
 * end node carrying `elapsed_cost`: the path cost accumulated so far.
 * Differencing consecutive values gives each edge's cost.
 *
 * `edge_walk` snaps to exactly the edges the router used rather than
 * re-matching, and the costing model must match the route request or the
 * numbers drift.
 */

/**
 * `elapsed_cost` is undocumented — the map-matching docs list only
 * `elapsed_time` in the end-node table — but Valhalla emits it unconditionally
 * alongside `elapsed_time` under the `node.elapsed_time` filter key. It cannot
 * be requested on its own, and it cannot be turned off.
 *
 * `transition_cost` is ours: upstream serialises only `transition_time`, and
 * our deployment patches `trace_serializer.cc` to emit the cost beside it.
 * Without it an edge's cost cannot be separated from the penalty for entering
 * it, so `toEdgeSegments` degrades to leaving the transition in the edge when
 * the field is missing.
 */
export const TRACE_ATTRIBUTE_FILTERS = [
  'edge.id',
  'edge.way_id',
  'edge.length',
  'edge.road_class',
  'edge.speed',
  'edge.names',
  'edge.begin_shape_index',
  'edge.end_shape_index',
  'node.elapsed_time',
  'node.transition_time',
  'node.type',
  'node.traffic_signal',
  'shape',
] as const;

interface TraceEdge {
  id?: number;
  way_id?: number;
  length?: number;
  road_class?: string;
  speed?: number;
  names?: string[];
  begin_shape_index?: number;
  end_shape_index?: number;
  end_node?: {
    elapsed_time?: number;
    elapsed_cost?: number;
    transition_time?: number;
    /** Fork-specific; absent on an unpatched Valhalla. */
    transition_cost?: number;
    type?: string;
    traffic_signal?: boolean;
  };
}

export interface TraceAttributesResponse {
  shape?: string;
  edges?: TraceEdge[];
}

/** Per-edge detail the popup shows on top of the shared segment fields. */
export interface EdgeDetail {
  edgeId?: number;
  wayId?: number;
  roadClass?: string;
  /** km/h, as Valhalla assigned it to this edge. */
  speed?: number;
  /**
   * The transition *into* this edge, split off from its cost and shown as an
   * intersection node instead. Valhalla reports a transition on the node that
   * ends the previous edge, so it is shifted by one on the way in.
   */
  transitionCost: number;
  transitionTime: number;
}

export type EdgeSegment = RouteSegment & EdgeDetail;

/**
 * One intersection along the route, carrying the cost of turning through it.
 *
 * Transition cost is a third of a typical route's total and has nothing to do
 * with the length of the edge that follows, so folding it into that edge made
 * short links look absurd — 3800 cost/km for nine metres of road. Drawn as its
 * own node it stops distorting the road segments and becomes the thing it
 * actually is: the price of a manoeuvre at a point.
 */
export interface TransitionNode {
  index: number;
  /** [lng, lat] of the junction itself. */
  coordinate: number[];
  cost: number;
  seconds: number;
  /** Where the vehicle is heading after the turn. */
  intoStreets: string[];
  intoRoadClass?: string;
  /**
   * Valhalla keeps OSM way ids on edges but drops OSM *node* ids when it
   * builds the graph, so a junction cannot be named directly. The pair of ways
   * that meet here identifies it instead — that and the coordinate are enough
   * to find the node in OSM.
   */
  fromWayId?: number;
  intoWayId?: number;
  /** `street_intersection`, `motor_way_junction`, … */
  nodeType?: string;
  trafficSignal: boolean;
}

export const buildTraceAttributesRequest = ({
  shape,
  profile,
  costingOptions,
}: {
  shape: string;
  profile: Profile;
  costingOptions: Record<string, unknown>;
}) => {
  const valhallaProfile = profile === 'car' ? 'auto' : profile;

  return {
    encoded_polyline: shape,
    shape_match: 'edge_walk',
    costing: valhallaProfile,
    costing_options: { [valhallaProfile]: costingOptions },
    filters: {
      action: 'include',
      attributes: [...TRACE_ATTRIBUTE_FILTERS],
    },
  };
};

/** Decodes the trace's polyline6 shape into [lng, lat] pairs. */
const decodeShape = (shape: string) =>
  decode(shape, 6).map((point) => [point[1] ?? 0, point[0] ?? 0]);

/**
 * Turns a trace response into drawable segments, one per graph edge, plus the
 * intersections between them.
 *
 * An edge's raw cost is the difference between its end node's `elapsed_cost`
 * and the previous edge's, and **that delta includes the transition into the
 * edge** — Valhalla charges the manoeuvre when entering, and it lands in the
 * entered edge's delta. Subtracting it gives the edge's own cost and hands the
 * penalty to a `TransitionNode` instead, which is the only way a nine-metre
 * link stops reading as thousands of cost per kilometre.
 *
 * Valhalla reports a transition on the node that *ends* the previous edge, so
 * everything shifts by one: `edges[i - 1].end_node` is the junction entering
 * edge `i`, and the shape point they share is where it sits.
 */
export const toTraceSegments = (
  response: TraceAttributesResponse
): { segments: EdgeSegment[]; nodes: TransitionNode[] } => {
  const edges = response.edges ?? [];
  if (edges.length === 0 || !response.shape) return { segments: [], nodes: [] };

  const shape = decodeShape(response.shape);
  const segments: EdgeSegment[] = [];
  const nodes: TransitionNode[] = [];
  let previousCost = 0;
  let previousTime = 0;

  edges.forEach((edge, index) => {
    const begin = edge.begin_shape_index;
    const end = edge.end_shape_index;
    if (begin === undefined || end === undefined) return;

    const coordinates = shape.slice(begin, end + 1);
    if (coordinates.length < 2) return;

    const elapsedCost = edge.end_node?.elapsed_cost ?? previousCost;
    const elapsedTime = edge.end_node?.elapsed_time ?? previousTime;

    const entry = index > 0 ? edges[index - 1]?.end_node : undefined;
    // Missing on an unpatched Valhalla; the transition then stays in the edge.
    const transitionCost = entry?.transition_cost ?? 0;
    const transitionTime = entry?.transition_time ?? 0;

    segments.push({
      index: segments.length,
      streets: edge.names ?? [],
      instruction: '',
      length: edge.length ?? 0,
      time: elapsedTime - previousTime - transitionTime,
      cost: elapsedCost - previousCost - transitionCost,
      coordinates,
      edgeId: edge.id,
      wayId: edge.way_id,
      roadClass: edge.road_class,
      speed: edge.speed,
      transitionCost,
      transitionTime,
    });

    // A free junction is not worth a dot on the map.
    if (transitionCost > 0 && coordinates[0]) {
      nodes.push({
        index: nodes.length,
        coordinate: coordinates[0],
        cost: transitionCost,
        seconds: transitionTime,
        intoStreets: edge.names ?? [],
        intoRoadClass: edge.road_class,
        fromWayId: edges[index - 1]?.way_id,
        intoWayId: edge.way_id,
        nodeType: entry?.type,
        trafficSignal: entry?.traffic_signal ?? false,
      });
    }

    previousCost = elapsedCost;
    previousTime = elapsedTime;
  });

  return { segments, nodes };
};
