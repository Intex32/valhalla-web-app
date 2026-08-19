import type { Profile } from '@/stores/common-store';
import { isValidProfile } from '@/components/utils';

/**
 * What the app routes: one costing profile on one Valhalla instance. Selecting
 * `car` on two servers gives two independent targets — separate requests,
 * settings, colours and results.
 */
export interface TargetRef {
  instanceId: string;
  profile: Profile;
}

/**
 * Stable identity for a target.
 *
 * Two separators are in play on purpose: the URL uses `:` because
 * `?profile=public:car` stays readable in a permalink, while keys use `__`
 * because they end up in DOM ids and CSS selectors, where a colon needs
 * escaping. Instance ids are slugs, so neither separator can occur inside one.
 */
export const targetKey = ({ instanceId, profile }: TargetRef): string =>
  `${instanceId}__${profile}`;

export const TARGET_URL_SEPARATOR = ':';

/** Instance ids must survive being pasted into a DOM id and a URL unescaped. */
export const isValidInstanceId = (id: string): boolean =>
  /^[a-z0-9][a-z0-9-]*$/.test(id);

export const slugifyInstanceId = (label: string): string => {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'instance' : slug;
};

/**
 * Parses the `profile` search param. Entries are `instanceId:profile`; a bare
 * `profile` belongs to `fallbackInstanceId`, which keeps pre-multi-instance
 * permalinks (`?profile=car,emergency`) working.
 */
export const parseTargets = (
  param: string | undefined,
  knownInstanceIds: string[],
  fallbackInstanceId: string
): TargetRef[] => {
  if (!param) return [];

  const seen = new Set<string>();
  const targets: TargetRef[] = [];

  for (const entry of param.split(',')) {
    const trimmed = entry.trim();
    if (trimmed === '') continue;

    const separator = trimmed.indexOf(TARGET_URL_SEPARATOR);
    const instanceId =
      separator === -1 ? fallbackInstanceId : trimmed.slice(0, separator);
    const profile = separator === -1 ? trimmed : trimmed.slice(separator + 1);

    if (!isValidProfile(profile)) continue;
    // Drop targets whose instance no longer exists rather than routing into
    // the void — the user may have deleted it since the link was made.
    if (!knownInstanceIds.includes(instanceId)) continue;

    const target = { instanceId, profile };
    const key = targetKey(target);
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(target);
  }

  return targets;
};

export const serializeTargets = (targets: TargetRef[]): string =>
  targets
    .map(
      ({ instanceId, profile }) =>
        `${instanceId}${TARGET_URL_SEPARATOR}${profile}`
    )
    .join(',');

export const sameTarget = (a: TargetRef, b: TargetRef): boolean =>
  a.instanceId === b.instanceId && a.profile === b.profile;

/** The target that single-target actions (optimized route, height graph) use. */
export const getPrimaryTarget = (targets: TargetRef[]): TargetRef | null =>
  targets[0] ?? null;

/** Targets grouped by instance, in the instance order given. */
export const groupTargetsByInstance = (
  targets: TargetRef[],
  instanceIds: string[]
): { instanceId: string; targets: TargetRef[] }[] =>
  instanceIds
    .map((instanceId) => ({
      instanceId,
      targets: targets.filter((target) => target.instanceId === instanceId),
    }))
    .filter((group) => group.targets.length > 0);
