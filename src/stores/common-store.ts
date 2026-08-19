import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { PossibleSettings } from '@/components/types';
import {
  settingsInit,
  settingsInitTruckOverride,
} from '@/components/settings-panel/settings-options';
import { targetKey, type TargetRef } from '@/utils/targets';
import { z } from 'zod';

export const profileEnum = z.enum([
  'auto',
  'bicycle',
  'pedestrian',
  'car',
  'truck',
  'bus',
  'motor_scooter',
  'motorcycle',
  'emergency',
]);

export type Profile = z.infer<typeof profileEnum>;

/**
 * A bag of costing values plus the set of options the user has opted into
 * sending. Anything not enabled is omitted from `costing_options` entirely, so
 * Valhalla applies its own per-costing default instead of ours.
 */
export interface ScopedSettings {
  values: PossibleSettings;
  enabled: Record<string, boolean>;
}

const createScope = (
  base: PossibleSettings = settingsInit
): ScopedSettings => ({
  values: { ...base },
  enabled: {},
});

const seedFor = (profile: Profile): PossibleSettings => ({
  ...(profile === 'truck' ? settingsInitTruckOverride : settingsInit),
  // Alternates are per target and off by default — comparing servers is about
  // the main route, and every extra alternate is another request's worth of work.
  alternates: 0,
});

// One stable fallback per target, so reading a scope the user hasn't touched
// yet doesn't hand React a new object on every render.
const untouchedScopes = new Map<string, ScopedSettings>();

/** A target's own scope, seeded on read so the panel renders before any edit. */
export const getTargetScope = (
  perTarget: Record<string, ScopedSettings>,
  target: TargetRef
): ScopedSettings => {
  const edited = perTarget[targetKey(target)];
  if (edited) return edited;

  const key = targetKey(target);
  let untouched = untouchedScopes.get(key);
  if (!untouched) {
    untouched = createScope(seedFor(target.profile));
    untouchedScopes.set(key, untouched);
  }
  return untouched;
};

interface CommonState {
  settingsPanelOpen: boolean;
  directionsPanelOpen: boolean;
  coordinates: number[][];
  loading: boolean;
  /** Costing options per (instance, profile) target — nothing is shared. */
  perTarget: Record<string, ScopedSettings>;
  /** Polygons drawn on the map; one drawing applies to every target. */
  excludePolygons: GeoJSON.GeoJSON[];
  /** Client-side only: whether waypoint input reverse-geocodes. */
  useGeocoding: boolean;
  dateTime: { type: number; value: string };
  mapReady: boolean;
}

interface CommonActions {
  showLoading: (loading: boolean) => void;
  zoomTo: (coordinates: number[][]) => void;
  toggleSettings: () => void;
  toggleDirections: () => void;
  /** Sets a target's value and opts it in — editing means wanting it sent. */
  updateTargetSetting: (
    target: TargetRef,
    param: keyof PossibleSettings,
    value: PossibleSettings[keyof PossibleSettings]
  ) => void;
  setTargetEnabled: (
    target: TargetRef,
    param: string,
    enabled: boolean
  ) => void;
  setExcludePolygons: (polygons: GeoJSON.GeoJSON[]) => void;
  setUseGeocoding: (useGeocoding: boolean) => void;
  resetSettings: (targets: TargetRef[]) => void;
  updateDateTime: (key: 'type' | 'value', value: string | number) => void;
  setMapReady: (ready: boolean) => void;
}

type CommonStore = CommonState & CommonActions;

// Open the left panel by default on non-mobile viewports (Tailwind md breakpoint).
const DEFAULT_PANEL_OPEN =
  typeof window !== 'undefined' && window.innerWidth >= 768;

export const useCommonStore = create<CommonStore>()(
  devtools(
    immer((set) => ({
      settingsPanelOpen: false,
      directionsPanelOpen: DEFAULT_PANEL_OPEN,
      coordinates: [],
      loading: false,
      perTarget: {},
      excludePolygons: [],
      useGeocoding: true,
      dateTime: {
        type: -1,
        value: new Date().toISOString().slice(0, 16),
      },
      mapReady: false,

      showLoading: (loading) => set({ loading }),
      zoomTo: (coordinates) => set({ coordinates }),
      setMapReady: (ready) => set({ mapReady: ready }),
      toggleSettings: () =>
        set(
          (state) => {
            state.settingsPanelOpen = !state.settingsPanelOpen;
          },
          undefined,
          'toggleSettings'
        ),
      toggleDirections: () =>
        set(
          (state) => {
            state.directionsPanelOpen = !state.directionsPanelOpen;
          },
          undefined,
          'toggleDirections'
        ),
      updateTargetSetting: (target, param, value) =>
        set(
          (state) => {
            const key = targetKey(target);
            state.perTarget[key] ??= createScope(seedFor(target.profile));
            state.perTarget[key].values[param] = value;
            // Touching a control is the user asking for that value to be used,
            // so it opts itself in rather than needing a second click.
            state.perTarget[key].enabled[param] = true;
          },
          undefined,
          'updateTargetSetting'
        ),

      setTargetEnabled: (target, param, enabled) =>
        set(
          (state) => {
            const key = targetKey(target);
            state.perTarget[key] ??= createScope(seedFor(target.profile));
            // The value is left in place so unchecking and re-checking restores
            // what the user had dialled in.
            state.perTarget[key].enabled[param] = enabled;
          },
          undefined,
          'setTargetEnabled'
        ),

      setExcludePolygons: (polygons) =>
        set(
          (state) => {
            state.excludePolygons = polygons;
          },
          undefined,
          'setExcludePolygons'
        ),

      setUseGeocoding: (useGeocoding) =>
        set(
          (state) => {
            state.useGeocoding = useGeocoding;
          },
          undefined,
          'setUseGeocoding'
        ),

      resetSettings: (targets) =>
        set(
          (state) => {
            for (const target of targets) {
              state.perTarget[targetKey(target)] = createScope(
                seedFor(target.profile)
              );
            }
          },
          undefined,
          'resetSettings'
        ),
      updateDateTime: (key, value) =>
        set(
          (state) => {
            // The Select control fires onValueChange with strings; coerce here
            // so type stays numeric (formatTriggerLabel uses === comparisons).
            if (key === 'type') state.dateTime.type = Number(value);
            else state.dateTime.value = value as string;
          },
          undefined,
          'updateDateTime'
        ),
    })),
    { name: 'common' }
  )
);
