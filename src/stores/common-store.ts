import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { PossibleSettings } from '@/components/types';
import {
  settingsInit,
  settingsInitTruckOverride,
  QUICK_SETTING_PARAMS,
} from '@/components/settings-panel/settings-options';
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

const seedFor = (profile: Profile): PossibleSettings =>
  profile === 'truck' ? settingsInitTruckOverride : settingsInit;

// One stable fallback per profile, so reading a scope the user hasn't touched
// yet doesn't hand React a new object on every render.
const untouchedScopes = new Map<Profile, ScopedSettings>();

/** A profile's own scope, seeded on read so the panel renders before any edit. */
export const getProfileScope = (
  perProfile: Partial<Record<Profile, ScopedSettings>>,
  profile: Profile
): ScopedSettings => {
  const edited = perProfile[profile];
  if (edited) return edited;

  let untouched = untouchedScopes.get(profile);
  if (!untouched) {
    untouched = createScope(seedFor(profile));
    untouchedScopes.set(profile, untouched);
  }
  return untouched;
};

interface CommonState {
  settingsPanelOpen: boolean;
  directionsPanelOpen: boolean;
  coordinates: number[][];
  loading: boolean;
  /** General costing options, applied to every profile that understands them. */
  shared: ScopedSettings;
  /** Options a profile owns privately; these win over the shared value. */
  perProfile: Partial<Record<Profile, ScopedSettings>>;
  dateTime: { type: number; value: string };
  mapReady: boolean;
}

interface CommonActions {
  showLoading: (loading: boolean) => void;
  zoomTo: (coordinates: number[][]) => void;
  toggleSettings: () => void;
  toggleDirections: () => void;
  /** Sets a shared value and opts it in — editing a setting means wanting it sent. */
  updateSharedSetting: (
    param: keyof PossibleSettings,
    value: PossibleSettings[keyof PossibleSettings]
  ) => void;
  setSharedEnabled: (param: string, enabled: boolean) => void;
  updateProfileSetting: (
    profile: Profile,
    param: keyof PossibleSettings,
    value: PossibleSettings[keyof PossibleSettings]
  ) => void;
  setProfileEnabled: (
    profile: Profile,
    param: string,
    enabled: boolean
  ) => void;
  resetSettings: (profiles: Profile[]) => void;
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
      shared: createScope(),
      perProfile: {},
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
      updateSharedSetting: (param, value) =>
        set(
          (state) => {
            state.shared.values[param] = value;
            // Touching a control is the user asking for that value to be used,
            // so it opts itself in rather than needing a second click.
            state.shared.enabled[param] = true;
          },
          undefined,
          'updateSharedSetting'
        ),

      setSharedEnabled: (param, enabled) =>
        set(
          (state) => {
            // The value is left in place so unchecking and re-checking restores
            // what the user had dialled in.
            state.shared.enabled[param] = enabled;
          },
          undefined,
          'setSharedEnabled'
        ),

      updateProfileSetting: (profile, param, value) =>
        set(
          (state) => {
            state.perProfile[profile] ??= createScope(seedFor(profile));
            state.perProfile[profile].values[param] = value;
            state.perProfile[profile].enabled[param] = true;
          },
          undefined,
          'updateProfileSetting'
        ),

      setProfileEnabled: (profile, param, enabled) =>
        set(
          (state) => {
            state.perProfile[profile] ??= createScope(seedFor(profile));
            state.perProfile[profile].enabled[param] = enabled;
          },
          undefined,
          'setProfileEnabled'
        ),

      resetSettings: (profiles) =>
        set(
          (state) => {
            // Quick-panel params are cross-profile user preferences carried in
            // the URL, so a reset of the advanced panel leaves them alone.
            const preserved: Partial<PossibleSettings> = {};
            const preservedEnabled: Record<string, boolean> = {};
            for (const param of QUICK_SETTING_PARAMS) {
              preserved[param] = state.shared.values[param];
              preservedEnabled[param] = state.shared.enabled[param] ?? false;
            }

            state.shared = {
              values: { ...settingsInit, ...preserved },
              enabled: preservedEnabled,
            };
            for (const profile of profiles) {
              state.perProfile[profile] = createScope(seedFor(profile));
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
