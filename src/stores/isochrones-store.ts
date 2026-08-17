import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type {
  ActiveWaypoint,
  ValhallaIsochroneResponse,
} from '@/components/types';
import type { Profile } from '@/stores/common-store';
import type { PaletteId } from '@/utils/isochrone-palettes';
import { DEFAULT_OPACITY } from '@/utils/isochrone-palettes';

/** One Valhalla `/isochrone` response, tagged with the profile it came from. */
export interface ProfileIsochroneResult {
  profile: Profile;
  data: ValhallaIsochroneResponse;
}

interface IsochroneResults {
  /** One entry per selected profile that returned contours, in selection order. */
  byProfile: ProfileIsochroneResult[];
  /** Per-profile map visibility. */
  show: Partial<Record<Profile, boolean>>;
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
  toggleShowOnMap: (params: { profile: Profile; show: boolean }) => void;
  receiveIsochroneResults: (results: ProfileIsochroneResult[]) => void;
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
      results: { byProfile: [], show: {} },
      colorPalette: 'default',
      opacity: DEFAULT_OPACITY,

      clearIsos: () =>
        set(
          (state) => {
            state.successful = false;
            state.userInput = '';
            state.geocodeResults = [];
            state.selectedAddress = null;
            state.results = { byProfile: [], show: {} };
          },
          undefined,
          'clearIsos'
        ),

      toggleShowOnMap: ({ profile, show }) =>
        set(
          (state) => {
            state.results.show[profile] = show;
          },
          undefined,
          'toggleShowOnMap'
        ),

      receiveIsochroneResults: (results) =>
        set(
          (state) => {
            const show: Partial<Record<Profile, boolean>> = {};
            for (const { profile } of results) show[profile] = true;

            state.successful = results.length > 0;
            state.results = { byProfile: results, show };
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
