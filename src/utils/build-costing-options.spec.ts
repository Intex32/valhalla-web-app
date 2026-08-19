import { describe, it, expect } from 'vitest';
import { buildCostingOptions, targetParams } from './build-costing-options';
import {
  generalSettings,
  getProfileSettingsGroup,
  groupParams,
} from '@/components/settings-panel/settings-options';
import { VALID_PROFILES } from '@/components/utils';
import { getTargetScope } from '@/stores/common-store';
import type { Profile, ScopedSettings } from '@/stores/common-store';
import type { PossibleSettings } from '@/components/types';

/**
 * A target's scope as the store would seed it, with the given edits on top.
 * Seeding through the store keeps the defaults under test the real ones —
 * `alternates: 0` in particular.
 */
const scope = (
  profile: Profile,
  values: Partial<PossibleSettings> = {},
  enabled: Record<string, boolean> = {}
): ScopedSettings => {
  const seeded = getTargetScope({}, { instanceId: 'local', profile });
  return { values: { ...seeded.values, ...values }, enabled };
};

describe('buildCostingOptions', () => {
  it('sends nothing when the user has enabled nothing', () => {
    const { costing } = buildCostingOptions('car', scope('car'));

    // An empty payload is the whole point: Valhalla then applies its own
    // per-costing defaults instead of ours.
    expect(costing).toEqual({});
  });

  it('sends an option once it is enabled', () => {
    const { costing } = buildCostingOptions(
      'car',
      scope('car', { use_ferry: 0.25 }, { use_ferry: true })
    );

    expect(costing).toEqual({ use_ferry: 0.25 });
  });

  it('sends general and profile-owned options from the one scope', () => {
    // There is no shared/profile split any more — `use_ferry` (general) and
    // `top_speed` (car's own) come out of the same target scope.
    const { costing } = buildCostingOptions(
      'car',
      scope(
        'car',
        { use_ferry: 0.25, top_speed: 90 },
        { use_ferry: true, top_speed: true }
      )
    );

    expect(costing).toEqual({ use_ferry: 0.25, top_speed: 90 });
  });

  it('leaves out an enabled option the costing model does not understand', () => {
    const pedestrian = scope(
      'pedestrian',
      { use_highways: 1, use_ferry: 0.25 },
      { use_highways: true, use_ferry: true }
    );

    // Pedestrian has no highway willingness, but does take a ferry one.
    expect(buildCostingOptions('pedestrian', pedestrian).costing).toEqual({
      use_ferry: 0.25,
    });
  });

  it('keeps a value out while it is disabled, even if it was edited', () => {
    const { costing } = buildCostingOptions(
      'car',
      scope('car', { top_speed: 90 }, { top_speed: false })
    );

    expect(costing).toEqual({});
  });

  it('sends only the enabled subset of an edited scope', () => {
    const { costing } = buildCostingOptions(
      'car',
      scope(
        'car',
        { gate_cost: 30, toll_booth_cost: 45, use_tolls: 0.1 },
        { gate_cost: true, use_tolls: true }
      )
    );

    expect(costing).toEqual({ gate_cost: 30, use_tolls: 0.1 });
  });

  it('configures the same profile independently per instance', () => {
    // Two targets, same costing model, different servers: nothing is shared,
    // so each gets exactly what its own scope says.
    const onPublic = scope('car', { gate_cost: 30 }, { gate_cost: true });
    const onLocal = scope('car', { gate_cost: 10 }, { gate_cost: true });

    expect(buildCostingOptions('car', onPublic).costing).toEqual({
      gate_cost: 30,
    });
    expect(buildCostingOptions('car', onLocal).costing).toEqual({
      gate_cost: 10,
    });
  });

  it('keeps each profile on its own values for the same option', () => {
    const car = scope('car', { gate_cost: 30 }, { gate_cost: true });
    const emergency = scope(
      'emergency',
      { gate_cost: 10 },
      { gate_cost: true }
    );

    expect(buildCostingOptions('car', car).costing).toEqual({ gate_cost: 30 });
    expect(buildCostingOptions('emergency', emergency).costing).toEqual({
      gate_cost: 10,
    });
  });

  it('returns an empty costing payload for the option-less auto profile', () => {
    const auto = scope('auto', { use_ferry: 0.25 }, { use_ferry: true });

    expect(buildCostingOptions('auto', auto).costing).toEqual({});
  });

  describe('request-level params', () => {
    it('takes alternates from the target scope regardless of any checkbox', () => {
      const { directions } = buildCostingOptions(
        'car',
        scope('car', { alternates: 3 })
      );

      expect(directions.alternates).toBe(3);
    });

    it('defaults alternates to 0 — a comparison is about the main route', () => {
      const { directions } = buildCostingOptions('car', scope('car'));

      expect(directions.alternates).toBe(0);
    });

    it('never sends alternates as a costing option', () => {
      const { costing } = buildCostingOptions(
        'car',
        scope('car', { alternates: 3 }, { alternates: true })
      );

      expect(costing).not.toHaveProperty('alternates');
    });

    it('takes exclude_polygons from the global map drawing, not the scope', () => {
      const drawn: GeoJSON.GeoJSON[] = [
        {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
      ];

      const { directions } = buildCostingOptions('car', scope('car'), drawn);

      expect(directions.exclude_polygons).toBe(drawn);
    });

    it('sends no exclude polygons when nothing is drawn', () => {
      const { directions } = buildCostingOptions('car', scope('car'));

      expect(directions.exclude_polygons).toEqual([]);
    });
  });
});

describe('targetParams', () => {
  it('merges a profile without offering any param twice', () => {
    // `maneuver_penalty` was once listed both generally ("Turn Penalty") and
    // per profile ("Maneuver Penalty"). Now that both lists are merged into one
    // section, a duplicate would mean two controls writing one Valhalla param.
    for (const profile of VALID_PROFILES) {
      if (profile === 'auto') continue;

      const merged = [
        ...groupParams(generalSettings[profile]),
        ...groupParams(getProfileSettingsGroup(profile)),
      ];
      const duplicates = merged.filter(
        (param, index) => merged.indexOf(param) !== index
      );

      expect({ profile, duplicates }).toEqual({ profile, duplicates: [] });
    }
  });

  it('covers every option a profile can be sent', () => {
    expect(targetParams('pedestrian')).toEqual(
      expect.arrayContaining([
        'use_ferry', // general
        'walking_speed', // pedestrian's own
        'type', // enum control
      ])
    );
    expect(targetParams('pedestrian')).not.toContain('use_highways');
  });

  it('is empty for auto, which exposes no options', () => {
    expect(targetParams('auto')).toEqual([]);
  });
});
