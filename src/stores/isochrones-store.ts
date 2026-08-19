import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type {
  ActiveWaypoint,
  ValhallaIsochroneResponse,
} from '@/components/types';
import { targetKey, type TargetRef } from '@/utils/targets';
import type { PaletteId } from '@/utils/isochrone-palettes';
import { DEFAULT_OPACITY } from '@/utils/isochrone-palettes';

/** One Valhalla `/isochrone` response, tagged with the target it came from. */
export interface TargetIsochroneResult {
  target: TargetRef;
  data: ValhallaIsochroneResponse;
}

/** Why a selected target produced no contours. */
export interface TargetIsochroneFailure {
  target: TargetRef;
  /** `unsupported` means the server has no such costing model (error_code 125). */
  kind: 'unsupported' | 'error';
  message: string;
}

interface IsochroneResults {
  /** One entry per target that returned contours, in selection order. */
  byTarget: TargetIsochroneResult[];
  /** Targets that returned nothing, so the panel can explain the gap. */
  failures: TargetIsochroneFailure[];
  /** Per-target map visibility, keyed by {@link targetKey}. */
  show: Record<string, boolean>;
}

interface IsochroneState {
  successful: boolean;
  userInput: string;
  geocodeResults: ActiveWaypoint[];
  selectedAddress: ActiveWaypoint | null;
  maxRange: number;
  interval: number;
  denoise: number;
  generalize: number;
  results: IsochroneResults;
  colorPalette: PaletteId;
  opacity: number;
}

interface IsochroneActions {
  clearIsos: () => void;
  toggleShowOnMap: (params: { target: TargetRef; show: boolean }) => void;
  receiveIsochroneResults: (params: {
    results: TargetIsochroneResult[];
    failures?: TargetIsochroneFailure[];
  }) => void;
  updateTextInput: (params: {
    userInput: string;
    addressIndex?: number;
  }) => void;
  updateSettings: (params: {
    name: 'maxRange' | 'interval' | 'denoise' | 'generalize';
    value: number;
  }) => void;
  updateVisualization: (params: {
    colorPalette?: PaletteId;
    opacity?: number;
  }) => void;
  receiveGeocodeResults: (addresses: ActiveWaypoint[]) => void;
}

type IsochroneStore = IsochroneState & IsochroneActions;

export const useIsochronesStore = create<IsochroneStore>()(
  devtools(
    immer((set) => ({
      successful: false,
      userInput: '',
      geocodeResults: [],
      selectedAddress: null,
      maxRange: 10,
      interval: 10,
      denoise: 0.1,
      generalize: 0,
      results: { byTarget: [], failures: [], show: {} },
      colorPalette: 'default',
      opacity: DEFAULT_OPACITY,

      clearIsos: () =>
        set(
          (state) => {
            state.successful = false;
            state.userInput = '';
            state.geocodeResults = [];
            state.selectedAddress = null;
            state.results = { byTarget: [], failures: [], show: {} };
          },
          undefined,
          'clearIsos'
        ),

      toggleShowOnMap: ({ target, show }) =>
        set(
          (state) => {
            state.results.show[targetKey(target)] = show;
          },
          undefined,
          'toggleShowOnMap'
        ),

      receiveIsochroneResults: ({ results, failures = [] }) =>
        set(
          (state) => {
            const show: Record<string, boolean> = {};
            for (const { target } of results) show[targetKey(target)] = true;

            state.successful = results.length > 0;
            state.results = { byTarget: results, failures, show };
          },
          undefined,
          'receiveIsochroneResults'
        ),

      updateTextInput: ({ userInput, addressIndex }) =>
        set(
          (state) => {
            state.userInput = userInput;

            if (
              addressIndex !== undefined &&
              state.geocodeResults[addressIndex]
            ) {
              state.selectedAddress = state.geocodeResults[addressIndex];
              state.geocodeResults = state.geocodeResults.map((result, i) => ({
                ...result,
                selected: i === addressIndex,
              }));
            }
          },
          undefined,
          'updateTextInput'
        ),

      updateSettings: ({ name, value }) =>
        set(
          (state) => {
            state[name] = value;
          },
          undefined,
          'updateSettings'
        ),

      updateVisualization: ({ colorPalette, opacity }) =>
        set(
          (state) => {
            if (colorPalette !== undefined) {
              state.colorPalette = colorPalette;
            }
            if (opacity !== undefined) {
              state.opacity = Math.min(1, Math.max(0, opacity));
            }
          },
          undefined,
          'updateVisualization'
        ),

      receiveGeocodeResults: (addresses) =>
        set(
          (state) => {
            state.geocodeResults = addresses;
          },
          undefined,
          'receiveGeocodeResults'
        ),
    })),
    { name: 'isochrone-store' }
  )
);
