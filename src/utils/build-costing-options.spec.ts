import { describe, it, expect } from 'vitest';
import { buildCostingOptions } from './build-costing-options';
import {
  generalSettings,
  getProfileSettingsGroup,
  groupParams,
  settingsInit,
} from '@/components/settings-panel/settings-options';
import { VALID_PROFILES } from '@/components/utils';
import type { ScopedSettings } from '@/stores/common-store';
import type { Profile } from '@/stores/common-store';

const scope = (
  values: Partial<typeof settingsInit> = {},
  enabled: Record<string, boolean> = {}
): ScopedSettings => ({
  values: { ...settingsInit, ...values },
  enabled,
});

const state = (
  shared: ScopedSettings,
  perProfile: Partial<Record<Profile, ScopedSettings>> = {}
) => ({ shared, perProfile });

describe('buildCostingOptions', () => {
  it('sends nothing when the user has enabled nothing', () => {
    const { costing } = buildCostingOptions('car', state(scope()));

    // An empty payload is the whole point: Valhalla then applies its own
    // per-costing defaults instead of ours.
    expect(costing).toEqual({});
  });

  it('sends a shared option once it is enabled', () => {
    const { costing } = buildCostingOptions(
      'car',
      state(scope({ use_ferry: 0.25 }, { use_ferry: true }))
    );

    expect(costing).toEqual({ use_ferry: 0.25 });
  });

  it('leaves out a shared option the costing model does not understand', () => {
    const shared = scope(
      { use_highways: 1, use_ferry: 0.25 },
      { use_highways: true, use_ferry: true }
    );

    // Pedestrian has no highway willingness, but does take a ferry one.
    const { costing } = buildCostingOptions('pedestrian', state(shared));

    expect(costing).toEqual({ use_ferry: 0.25 });
  });

  it('sends a profile option only for the profile that owns it', () => {
    const perProfile = {
      emergency: scope({ top_speed: 180 }, { top_speed: true }),
    };

    expect(
      buildCostingOptions('emergency', state(scope(), perProfile)).costing
    ).toEqual({ top_speed: 180 });
    expect(
      buildCostingOptions('car', state(scope(), perProfile)).costing
    ).toEqual({});
  });

  it('keeps each profile on its own values for the same option', () => {
    const perProfile = {
      car: scope({ gate_cost: 30 }, { gate_cost: true }),
      emergency: scope({ gate_cost: 10 }, { gate_cost: true }),
    };

    expect(
      buildCostingOptions('car', state(scope(), perProfile)).costing
    ).toEqual({ gate_cost: 30 });
    expect(
      buildCostingOptions('emergency', state(scope(), perProfile)).costing
    ).toEqual({ gate_cost: 10 });
  });

  it('offers no option in both scopes at once', () => {
    // `maneuver_penalty` was once listed both generally ("Turn Penalty") and
    // per profile ("Maneuver Penalty"), which cost it its place in the shared
    // section. Two controls for one Valhalla param is the bug; this catches it
    // coming back for any option.
    for (const profile of VALID_PROFILES) {
      if (profile === 'auto') continue;

      const general = groupParams(generalSettings[profile]);
      const own = groupParams(getProfileSettingsGroup(profile));
      const inBoth = general.filter((param) => own.includes(param));

      expect({ profile, inBoth }).toEqual({ profile, inBoth: [] });
    }
  });

  it('sends the shared value for a general option the profile does not own', () => {
    const shared = scope({ maneuver_penalty: 42 }, { maneuver_penalty: true });

    expect(
      buildCostingOptions('car', state(shared)).costing.maneuver_penalty
    ).toBe(42);
  });

  it('keeps a value out while it is disabled, even if it was edited', () => {
    const perProfile = {
      car: scope({ top_speed: 90 }, { top_speed: false }),
    };

    expect(
      buildCostingOptions('car', state(scope(), perProfile)).costing
    ).toEqual({});
  });

  it('always sends the request-level params regardless of any checkbox', () => {
    const { directions } = buildCostingOptions(
      'car',
      state(scope({ alternates: 3 }))
    );

    expect(directions.alternates).toBe(3);
    expect(directions.exclude_polygons).toEqual([]);
  });

  it('returns an empty costing payload for the option-less auto profile', () => {
    const shared = scope({ use_ferry: 0.25 }, { use_ferry: true });

    expect(buildCostingOptions('auto', state(shared)).costing).toEqual({});
  });
});
