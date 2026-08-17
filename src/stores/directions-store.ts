import type {
  ActiveWaypoint,
  ParsedDirectionsGeometry,
} from '@/components/types';
import type { Profile } from '@/stores/common-store';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export interface Waypoint {
  id: string;
  geocodeResults: ActiveWaypoint[];
  userInput: string;
}

/**
 * A single route within a profile's response: 0 is the main route, 1..n are
 * that response's alternates.
 */
export interface RouteRef {
  profile: Profile;
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

/** One Valhalla `/route` response, tagged with the profile that produced it. */
export interface ProfileRouteResult {
  profile: Profile;
  data: ParsedDirectionsGeometry;
}

interface RouteResults {
  /** One entry per selected profile that returned a route, in selection order. */
  byProfile: ProfileRouteResult[];
  /** Per-route map visibility, keyed by {@link routeKey}. */
  show: Record<string, boolean>;
}

export const routeKey = (profile: Profile, index: number): string =>
  `${profile}:${index}`;

/** The n-th route of a profile's response — index 0 is the main route. */
export const getRouteAt = (
  results: ProfileRouteResult[],
  { profile, index }: RouteRef
): ParsedDirectionsGeometry | null => {
  const entry = results.find((result) => result.profile === profile);
  if (!entry) return null;
  if (index === 0) return entry.data;
  return (
    (entry.data.alternates?.[index - 1] as ParsedDirectionsGeometry) ?? null
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
  highlightSegment: HighlightSegment;
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
  receiveRouteResults: (params: { results: ProfileRouteResult[] }) => void;
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
      highlightSegment: {
        startIndex: -1,
        endIndex: -1,
        index: -1,
        profile: 'bicycle',
      },
      waypoints: defaultWaypoints,
      zoomObj: { index: -1, timeNow: -1 },
      selectedAddresses: '',
      results: { byProfile: [], show: {} },
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

      toggleShowOnMap: ({ profile, index, show }) =>
        set(
          (state) => {
            state.results.show[routeKey(profile, index)] = show;
          },
          undefined,
          'toggleShowOnMap'
        ),

      clearRoutes: () =>
        set(
          (state) => {
            state.successful = false;
            state.inclineDeclineTotal = undefined;
            state.results = { byProfile: [], show: {} };
            state.activeRoute = null;
          },
          undefined,
          'clearRoutes'
        ),

      receiveRouteResults: ({ results }) =>
        set(
          (state) => {
            const show: Record<string, boolean> = {};
            for (const { profile, data } of results) {
              show[routeKey(profile, 0)] = true;
              data.alternates?.forEach((_, i) => {
                show[routeKey(profile, i + 1)] = true;
              });
            }

            const first = results[0];

            state.successful = results.length > 0;
            state.inclineDeclineTotal = undefined;
            state.results = { byProfile: results, show };
            state.activeRoute = first
              ? { profile: first.profile, index: 0 }
              : null;
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
              state.results = { byProfile: [], show: {} };
              state.activeRoute = null;
            }
          },
          undefined,
          'doRemoveWaypoint'
        ),

      highlightManeuver: (fromTo) =>
        set(
          (state) => {
            const { startIndex, endIndex } = state.highlightSegment;
            const isToggleOff =
              startIndex === fromTo.startIndex && endIndex === fromTo.endIndex;

            state.highlightSegment = isToggleOff
              ? { ...fromTo, startIndex: -1, endIndex: -1 }
              : fromTo;
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
