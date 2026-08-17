import {
  generalSettings,
  getProfileSettingsGroup,
  groupParams,
} from '@/components/settings-panel/settings-options';
import type { Profile } from '@/stores/common-store';
import { getProfileScope, type ScopedSettings } from '@/stores/common-store';
import type { PossibleSettings } from '@/components/types';

type CostingValue =
  | string
  | number
  | boolean
  | string[]
  | GeoJSON.GeoJSON[]
  | undefined;

export interface RequestSettings {
  costing: Record<string, CostingValue>;
  directions: {
    alternates: PossibleSettings['alternates'];
    exclude_polygons: PossibleSettings['exclude_polygons'];
  };
}

interface SettingsState {
  shared: ScopedSettings;
  perProfile: Partial<Record<Profile, ScopedSettings>>;
}

/**
 * Turns the panel state into one profile's `costing_options` payload.
 *
 * Only options the user has explicitly enabled are included — everything else
 * is left out so Valhalla applies its own default for that costing model. This
 * matters for models like `emergency`, whose whole point is defaults that
 * differ from `auto`; sending ours unconditionally would overwrite them.
 */
export const buildCostingOptions = (
  profile: Profile,
  { shared, perProfile }: SettingsState
): RequestSettings => {
  const costing: Record<string, CostingValue> = {};

  // Shared general options first, but only those this costing model understands.
  if (profile !== 'auto') {
    for (const param of groupParams(generalSettings[profile])) {
      if (shared.enabled[param]) {
        costing[param] = shared.values[param as keyof PossibleSettings];
      }
    }
  }

  // The profile's own section wins where the two overlap.
  const scope = getProfileScope(perProfile, profile);
  for (const param of groupParams(getProfileSettingsGroup(profile))) {
    if (scope.enabled[param]) {
      costing[param] = scope.values[param as keyof PossibleSettings];
    }
  }

  return {
    costing,
    // Request-level params rather than costing options — always sent.
    directions: {
      alternates: shared.values.alternates,
      exclude_polygons: shared.values.exclude_polygons,
    },
  };
};
