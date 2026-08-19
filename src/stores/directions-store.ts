import type {
  ActiveWaypoint,
  ParsedDirectionsGeometry,
} from '@/components/types';

import { targetKey, sameTarget, type TargetRef } from '@/utils/targets';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export interface Waypoint {
  id: string;
  geocodeResults: ActiveWaypoint[];
  userInput: string;
}

/**
 * A single route within a target's response: 0 is the main route, 1..n are
 * that response's alternates.
 */
export interface RouteRef extends TargetRef {
  index: number;
}

interface HighlightSegment extends RouteRef {
  startIndex: number;
  endIndex: number;
}

interface ZoomObj {
  index: number;
  timeNow: number;
}

/** One Valhalla `/route` response, tagged with the target that produced it. */
export interface TargetRouteResult {
  target: TargetRef;
  data: ParsedDirectionsGeometry;
}

/** Why a selected target produced no route. */
export interface TargetFailure {
  target: TargetRef;
  /** `unsupported` means the server has no such costing model (error_code 125). */
  kind: 'unsupported' | 'error';
  message: string;
}

interface RouteResults {
  /** One entry per target that returned a route, in selection order. */
  byTarget: TargetRouteResult[];
  /** Targets that returned nothing, so the panel can explain the gap. */
  failures: TargetFailure[];
  /** Per-route map visibility, keyed by {@link routeKey}. */
  show: Record<string, boolean>;
}

export const routeKey = (target: TargetRef, index: number): string =>
  `${targetKey(target)}__${index.toString()}`;

/** The n-th route of a target's response — index 0 is the main route. */
export const getRouteAt = (
  results: TargetRouteResult[],
  ref: RouteRef
): ParsedDirectionsGeometry | null => {
  // Must match BOTH instance and profile: two servers routing the same profile
  // are different results, and matching on profile alone silently picks the
  // first server's line.
  const entry = results.find((result) => sameTarget(result.target, ref));
  if (!entry) return null;
  if (ref.index === 0) return entry.data;
  return (
    (entry.data.alternates?.[ref.index - 1] as ParsedDirectionsGeometry) ?? null
  );
};

interface InclineDeclineTotal {
  [key: string]: unknown;
}

interface LatLng {
  lng: number;
  lat: number;
}

const createEmptyWaypoint = (id: string): Waypoint => ({
  id,
  geocodeResults: [],
  userInput: '',
});

export const defaultWaypoints: Waypoint[] = [
  createEmptyWaypoint('0'),
  createEmptyWaypoint('1'),
];

const getNextWaypointId = (waypoints: Waypoint[]): string => {
  const maxIndex = Math.max(...waypoints.map((wp) => parseInt(wp.id, 10)));
  return (isFinite(maxIndex) ? maxIndex + 1 : 0).toString();
};

const hasActiveRoute = (waypoints: Waypoint[]): boolean =>
  waypoints.filter(
    (wp) =>
      wp.geocodeResults.length > 0 && wp.geocodeResults.some((r) => r.selected)
  ).length >= 2;

export interface DirectionsState {
  successful: boolean;
  highlightSegment: HighlightSegment | null;
  waypoints: Waypoint[];
  zoomObj: ZoomObj;
  selectedAddresses: string | (Waypoint | null)[];
  results: RouteResults;
  inclineDeclineTotal?: InclineDeclineTotal;
  isOptimized: boolean;
  /** The route the panel and map highlight; null while there are no results. */
  activeRoute: RouteRef | null;
}

interface DirectionsActions {
  updateInclineDecline: (inclineDeclineTotal: InclineDeclineTotal) => void;
  toggleShowOnMap: (params: RouteRef & { show: boolean }) => void;
  clearRoutes: () => void;
  receiveRouteResults: (params: {
    results: TargetRouteResult[];
    failures?: TargetFailure[];
  }) => void;
  receiveGeocodeResults: (params: {
    index: number;
    addresses: ActiveWaypoint[];
  }) => void;
  updateTextInput: (params: {
    inputValue: string;
    index: number;
    addressindex?: number;
  }) => void;
  clearWaypoints: () => void;
  emptyWaypoint: (params: { index: number }) => void;
  setWaypoint: (waypoints: Waypoint[]) => void;
  addWaypointAtIndex: (params: { index: number; placeholder?: LatLng }) => void;
  addEmptyWaypointToEnd: () => void;
  doRemoveWaypoint: (params: { index: number }) => void;
  highlightManeuver: (fromTo: HighlightSegment) => void;
  zoomToManeuver: (zoomObj: ZoomObj) => void;
  updatePlaceholderAddressAtIndex: (
    index: number,
    lng: number,
    lat: number
  ) => void;
  setIsOptimized: (isOptimized: boolean) => void;
  setActiveRoute: (route: RouteRef) => void;
}

type DirectionsStore = DirectionsState & DirectionsActions;

export const useDirectionsStore = create<DirectionsStore>()(
  devtools(
    immer((set) => ({
      successful: false,
      highlightSegment: null,
      waypoints: defaultWaypoints,
      zoomObj: { index: -1, timeNow: -1 },
      selectedAddresses: '',
      results: { byTarget: [], failures: [], show: {} },
      isOptimized: false,
      activeRoute: null,

      updateInclineDecline: (inclineDeclineTotal) =>
        set(
          (state) => {
            state.inclineDeclineTotal = inclineDeclineTotal;
          },
          undefined,
          'updateInclineDecline'
        ),

      toggleShowOnMap: ({ instanceId, profile, index, show }) =>
        set(
          (state) => {
            state.results.show[routeKey({ instanceId, profile }, index)] = show;
          },
          undefined,
          'toggleShowOnMap'
        ),

      clearRoutes: () =>
        set(
          (state) => {
            state.successful = false;
            state.inclineDeclineTotal = undefined;
            state.results = { byTarget: [], failures: [], show: {} };
            state.activeRoute = null;
          },
          undefined,
          'clearRoutes'
        ),

      receiveRouteResults: ({ results, failures = [] }) =>
        set(
          (state) => {
            const show: Record<string, boolean> = {};
            for (const { target, data } of results) {
              show[routeKey(target, 0)] = true;
              data.alternates?.forEach((_, i) => {
                show[routeKey(target, i + 1)] = true;
              });
            }

            const first = results[0];

            state.successful = results.length > 0;
            state.inclineDeclineTotal = undefined;
            state.results = { byTarget: results, failures, show };
            state.activeRoute = first ? { ...first.target, index: 0 } : null;
          },
          undefined,
          'receiveRouteResults'
        ),

      receiveGeocodeResults: ({ index, addresses }) =>
        set(
          (state) => {
            if (state.waypoints[index]) {
              state.waypoints[index].geocodeResults = addresses;
              state.isOptimized = false;
            }
          },
          undefined,
          'receiveGeocodeResults'
        ),

      updateTextInput: ({ inputValue, index, addressindex }) =>
        set(
          (state) => {
            state.selectedAddresses = state.waypoints.flatMap((wp) =>
              wp.geocodeResults.map((_, i) => (i === addressindex ? wp : null))
            );

            if (state.waypoints[index]) {
              state.waypoints[index].userInput = inputValue;
              state.waypoints[index].geocodeResults = state.waypoints[
                index
              ].geocodeResults.map((result, j) => ({
                ...result,
                selected: j === addressindex,
              }));
              state.isOptimized = false;
            }
          },
          undefined,
          'updateTextInput'
        ),

      clearWaypoints: () =>
        set(
          (state) => {
            state.waypoints = [...defaultWaypoints];
            state.isOptimized = false;
          },
          undefined,
          'clearWaypoints'
        ),

      emptyWaypoint: ({ index }) =>
        set(
          (state) => {
            if (state.waypoints[index]) {
              state.waypoints[index].userInput = '';
              state.waypoints[index].geocodeResults = [];
              state.isOptimized = false;
            }
          },
          undefined,
          'emptyWaypoint'
        ),

      setWaypoint: (waypoints) =>
        set(
          (state) => {
            state.waypoints = waypoints;
          },
          undefined,
          'setWaypoint'
        ),

      addWaypointAtIndex: ({ index, placeholder }) =>
        set(
          (state) => {
            const id = getNextWaypointId(state.waypoints);

            const newWaypoint: Waypoint = placeholder
              ? {
                  id,
                  geocodeResults: [
                    {
                      title: '',
                      displaylnglat: [placeholder.lng, placeholder.lat],
                      sourcelnglat: [placeholder.lng, placeholder.lat],
                      key: index,
                      addressindex: index,
                    },
                  ],
                  userInput: `${placeholder.lng.toFixed(6)}, ${placeholder.lat.toFixed(6)}`,
                }
              : createEmptyWaypoint(id);

            state.waypoints.splice(index, 0, newWaypoint);
            state.isOptimized = false;
          },
          undefined,
          'addWaypointAtIndex'
        ),

      addEmptyWaypointToEnd: () =>
        set(
          (state) => {
            state.waypoints.push(
              createEmptyWaypoint((state.waypoints.length + 1).toString())
            );
            state.isOptimized = false;
          },
          undefined,
          'addEmptyWaypointToEnd'
        ),

      doRemoveWaypoint: ({ index }) =>
        set(
          (state) => {
            if (state.waypoints.length > 2) {
              state.waypoints.splice(index, 1);
            } else if (state.waypoints[index]) {
              state.waypoints[index].userInput = '';
              state.waypoints[index].geocodeResults = [];
            }

            state.isOptimized = false;

            if (!hasActiveRoute(state.waypoints)) {
              state.successful = false;
              state.inclineDeclineTotal = undefined;
              state.results = { byTarget: [], failures: [], show: {} };
              state.activeRoute = null;
            }
          },
          undefined,
          'doRemoveWaypoint'
        ),

      highlightManeuver: (fromTo) =>
        set(
          (state) => {
            const isToggleOff =
              state.highlightSegment?.startIndex === fromTo.startIndex &&
              state.highlightSegment.endIndex === fromTo.endIndex;

            state.highlightSegment = isToggleOff ? null : fromTo;
          },
          undefined,
          'highlightManeuver'
        ),

      zoomToManeuver: (zoomObj) =>
        set(
          (state) => {
            state.zoomObj = zoomObj;
          },
          undefined,
          'zoomToManeuver'
        ),

      updatePlaceholderAddressAtIndex: (index, lng, lat) =>
        set(
          (state) => {
            if (state.waypoints[index]) {
              state.waypoints[index].geocodeResults = [
                {
                  title: '',
                  displaylnglat: [lng, lat],
                  sourcelnglat: [lng, lat],
                  key: index,
                  addressindex: index,
                  selected: true,
                },
              ];
              state.waypoints[index].userInput =
                `${lng.toFixed(6)}, ${lat.toFixed(6)}`;
              state.isOptimized = false;
            }
          },
          undefined,
          'updatePlaceholderAddressAtIndex'
        ),

      setIsOptimized: (isOptimized) =>
        set(
          (state) => {
            state.isOptimized = isOptimized;
          },
          undefined,
          'setIsOptimized'
        ),

      setActiveRoute: (route) =>
        set(
          (state) => {
            state.activeRoute = route;
          },
          undefined,
          'setActiveRoute'
        ),
    })),
    { name: 'directions-store' }
  )
);
