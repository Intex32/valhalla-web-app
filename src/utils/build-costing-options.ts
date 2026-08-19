import {
  generalSettings,
  getProfileSettingsGroup,
  groupParams,
} from '@/components/settings-panel/settings-options';
import type { Profile, ScopedSettings } from '@/stores/common-store';
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

/** Every costing option a profile can be given, general and profile-owned alike. */
export const targetParams = (profile: Profile): string[] => {
  const general =
    profile === 'auto' ? [] : groupParams(generalSettings[profile]);
  return [
    ...new Set([...general, ...groupParams(getProfileSettingsGroup(profile))]),
  ];
};

/**
 * Turns one target's scope into its `costing_options` payload.
 *
 * Only options the user explicitly enabled are included — everything else is
 * left out so Valhalla applies its own default for that costing model on that
 * server. Nothing is shared between targets: two instances running the same
 * profile are configured, and sent, entirely independently.
 */
export const buildCostingOptions = (
  profile: Profile,
  scope: ScopedSettings,
  excludePolygons: GeoJSON.GeoJSON[] = []
): RequestSettings => {
  const costing: Record<string, CostingValue> = {};

  for (const param of targetParams(profile)) {
    if (scope.enabled[param]) {
      costing[param] = scope.values[param as keyof PossibleSettings];
    }
  }

  return {
    costing,
    directions: {
      // Request-level rather than costing options. `alternates` is the target's
      // own; the exclude polygons are one map drawing shared by every target.
      alternates: scope.values.alternates,
      exclude_polygons: excludePolygons,
    },
  };
};
