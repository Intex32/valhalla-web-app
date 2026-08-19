import { describe, it, expect } from 'vitest';
import {
  getPrimaryTarget,
  groupTargetsByInstance,
  isValidInstanceId,
  parseTargets,
  sameTarget,
  serializeTargets,
  slugifyInstanceId,
  targetKey,
  type TargetRef,
} from './targets';

const KNOWN = ['public', 'local'];

describe('targetKey', () => {
  it('joins instance and profile with the DOM-safe separator', () => {
    expect(targetKey({ instanceId: 'local', profile: 'car' })).toBe(
      'local__car'
    );
  });

  it('keeps two instances running the same profile apart', () => {
    expect(targetKey({ instanceId: 'public', profile: 'car' })).not.toBe(
      targetKey({ instanceId: 'local', profile: 'car' })
    );
  });

  it('never contains the URL separator, so keys stay usable as DOM ids', () => {
    expect(
      targetKey({ instanceId: 'local', profile: 'motor_scooter' })
    ).not.toContain(':');
  });
});

describe('parseTargets', () => {
  it('parses instance-qualified entries', () => {
    expect(parseTargets('public:car,local:emergency', KNOWN, 'local')).toEqual([
      { instanceId: 'public', profile: 'car' },
      { instanceId: 'local', profile: 'emergency' },
    ]);
  });

  it('gives a bare profile to the fallback instance', () => {
    // Pre-multi-instance permalinks (`?profile=car,emergency`) still work.
    expect(parseTargets('car,emergency', KNOWN, 'local')).toEqual([
      { instanceId: 'local', profile: 'car' },
      { instanceId: 'local', profile: 'emergency' },
    ]);
  });

  it('mixes bare and qualified entries in one param', () => {
    expect(parseTargets('car,public:bicycle', KNOWN, 'local')).toEqual([
      { instanceId: 'local', profile: 'car' },
      { instanceId: 'public', profile: 'bicycle' },
    ]);
  });

  it('drops entries for an instance that no longer exists', () => {
    // Routing into the void is worse than silently losing the target — the
    // user may have deleted that server since the link was made.
    expect(parseTargets('deleted:car,local:car', KNOWN, 'local')).toEqual([
      { instanceId: 'local', profile: 'car' },
    ]);
  });

  it('drops entries whose costing model is unknown to the app', () => {
    expect(parseTargets('local:hovercraft,local:car', KNOWN, 'local')).toEqual([
      { instanceId: 'local', profile: 'car' },
    ]);
  });

  it('keeps the same profile on two instances as two targets', () => {
    expect(parseTargets('public:car,local:car', KNOWN, 'local')).toEqual([
      { instanceId: 'public', profile: 'car' },
      { instanceId: 'local', profile: 'car' },
    ]);
  });

  it('dedupes repeated targets, including a bare/qualified pair', () => {
    expect(parseTargets('local:car,local:car,car', KNOWN, 'local')).toEqual([
      { instanceId: 'local', profile: 'car' },
    ]);
  });

  it('preserves the order the param lists them in', () => {
    expect(
      parseTargets('local:emergency,public:bicycle,local:car', KNOWN, 'local')
    ).toEqual([
      { instanceId: 'local', profile: 'emergency' },
      { instanceId: 'public', profile: 'bicycle' },
      { instanceId: 'local', profile: 'car' },
    ]);
  });

  it('tolerates whitespace and empty entries', () => {
    expect(parseTargets(' local:car , , public:car ', KNOWN, 'local')).toEqual([
      { instanceId: 'local', profile: 'car' },
      { instanceId: 'public', profile: 'car' },
    ]);
  });

  it('returns nothing for an empty or missing param', () => {
    expect(parseTargets(undefined, KNOWN, 'local')).toEqual([]);
    expect(parseTargets('', KNOWN, 'local')).toEqual([]);
  });

  it('drops an entry with a missing profile or a missing instance', () => {
    expect(parseTargets('local:,:car', KNOWN, 'local')).toEqual([]);
  });

  it('drops everything when the fallback instance is itself unknown', () => {
    expect(parseTargets('car', KNOWN, 'gone')).toEqual([]);
  });
});

describe('serializeTargets', () => {
  it('writes instance-qualified entries', () => {
    expect(
      serializeTargets([
        { instanceId: 'public', profile: 'car' },
        { instanceId: 'local', profile: 'emergency' },
      ])
    ).toBe('public:car,local:emergency');
  });

  it('round-trips through parseTargets', () => {
    const targets: TargetRef[] = [
      { instanceId: 'local', profile: 'motor_scooter' },
      { instanceId: 'public', profile: 'pedestrian' },
      { instanceId: 'public', profile: 'car' },
    ];

    expect(parseTargets(serializeTargets(targets), KNOWN, 'local')).toEqual(
      targets
    );
  });

  it('serializes an empty selection to an empty string', () => {
    expect(serializeTargets([])).toBe('');
  });
});

describe('sameTarget', () => {
  it('is true only when instance and profile both match', () => {
    const target: TargetRef = { instanceId: 'local', profile: 'car' };

    expect(sameTarget(target, { instanceId: 'local', profile: 'car' })).toBe(
      true
    );
    expect(sameTarget(target, { instanceId: 'public', profile: 'car' })).toBe(
      false
    );
    expect(
      sameTarget(target, { instanceId: 'local', profile: 'emergency' })
    ).toBe(false);
  });
});

describe('getPrimaryTarget', () => {
  it('returns the first selected target', () => {
    expect(
      getPrimaryTarget([
        { instanceId: 'public', profile: 'car' },
        { instanceId: 'local', profile: 'car' },
      ])
    ).toEqual({ instanceId: 'public', profile: 'car' });
  });

  it('returns null when nothing is selected', () => {
    expect(getPrimaryTarget([])).toBeNull();
  });
});

describe('groupTargetsByInstance', () => {
  it('groups in instance order and skips instances with no target', () => {
    const targets: TargetRef[] = [
      { instanceId: 'local', profile: 'car' },
      { instanceId: 'public', profile: 'bicycle' },
      { instanceId: 'local', profile: 'emergency' },
    ];

    expect(
      groupTargetsByInstance(targets, ['public', 'local', 'staging'])
    ).toEqual([
      {
        instanceId: 'public',
        targets: [{ instanceId: 'public', profile: 'bicycle' }],
      },
      {
        instanceId: 'local',
        targets: [
          { instanceId: 'local', profile: 'car' },
          { instanceId: 'local', profile: 'emergency' },
        ],
      },
    ]);
  });
});

describe('isValidInstanceId', () => {
  it('accepts lowercase slugs', () => {
    for (const id of ['local', 'public', 'staging-2', 'a', '2']) {
      expect({ id, valid: isValidInstanceId(id) }).toEqual({ id, valid: true });
    }
  });

  it('rejects anything that would need escaping in a URL or DOM id', () => {
    // Both separators must be impossible inside an id, or a target key would
    // no longer parse back into the pair it came from.
    for (const id of [
      '',
      'Local',
      'my server',
      'local:car',
      'local__car',
      '-local',
      'löcal',
    ]) {
      expect({ id, valid: isValidInstanceId(id) }).toEqual({
        id,
        valid: false,
      });
    }
  });
});

describe('slugifyInstanceId', () => {
  it('lowercases and hyphenates a label', () => {
    expect(slugifyInstanceId('My Valhalla')).toBe('my-valhalla');
  });

  it('collapses runs of punctuation and trims leading/trailing hyphens', () => {
    expect(slugifyInstanceId('  Staging -- Server!  ')).toBe('staging-server');
  });

  it('falls back to "instance" when nothing usable is left', () => {
    expect(slugifyInstanceId('')).toBe('instance');
    expect(slugifyInstanceId('!!!')).toBe('instance');
  });

  it('always produces a valid instance id', () => {
    for (const label of ['My Valhalla', '!!!', 'Läufer 2', 'a']) {
      const slug = slugifyInstanceId(label);
      expect({ label, valid: isValidInstanceId(slug) }).toEqual({
        label,
        valid: true,
      });
    }
  });
});
