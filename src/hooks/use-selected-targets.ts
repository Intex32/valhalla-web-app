import { useMemo } from 'react';
import { useSearch } from '@tanstack/react-router';
import { useInstancesStore } from '@/stores/instances-store';
import type { Profile } from '@/stores/common-store';
import {
  getPrimaryTarget,
  parseTargets,
  type TargetRef,
} from '@/utils/targets';

const defaultProfile = ((import.meta.env
  .VITE_DEFAULT_COSTING_MODEL as string) || 'bicycle') as Profile;

const defaultInstanceUrl = import.meta.env.VITE_VALHALLA_URL as
  | string
  | undefined;

/**
 * The instance a bare, un-qualified entry belongs to.
 *
 * Pre-multi-instance permalinks (`?profile=car`) were made against whatever
 * single server the app was configured with — which the instances store
 * migrates into the entry matching VITE_VALHALLA_URL. Falling back to the first
 * instance instead would silently re-point old links at the public server, and
 * would hand it a fork-only default profile (`emergency`) it cannot route.
 */
const fallbackInstanceId = (
  instances: { id: string; url: string }[]
): string => {
  const configured = defaultInstanceUrl
    ? instances.find((instance) => instance.url === defaultInstanceUrl)
    : undefined;
  return configured?.id ?? instances[0]?.id ?? 'public';
};

const withFallback = (
  parsed: TargetRef[],
  instances: { id: string; url: string }[]
): TargetRef[] =>
  parsed.length > 0
    ? parsed
    : [{ instanceId: fallbackInstanceId(instances), profile: defaultProfile }];

/** Every (instance, profile) target selected in the picker, in selection order. */
export function useSelectedTargets(): TargetRef[] {
  const { profile } = useSearch({ from: '/$activeTab' });
  const instances = useInstancesStore((state) => state.instances);

  return useMemo(() => {
    const ids = instances.map((instance) => instance.id);
    return withFallback(
      parseTargets(profile, ids, fallbackInstanceId(instances)),
      instances
    );
  }, [profile, instances]);
}

/** The target that single-target actions (optimized route, elevation) run against. */
export function usePrimaryTarget(): TargetRef {
  const targets = useSelectedTargets();
  return (
    getPrimaryTarget(targets) ?? {
      instanceId: 'public',
      profile: defaultProfile,
    }
  );
}

/**
 * Same resolution as {@link useSelectedTargets} for non-React callers — the
 * query hooks read the router and stores directly rather than take parameters.
 */
export function readSelectedTargets(
  profileParam: string | undefined
): TargetRef[] {
  const { instances } = useInstancesStore.getState();
  const ids = instances.map((instance) => instance.id);
  return withFallback(
    parseTargets(profileParam, ids, fallbackInstanceId(instances)),
    instances
  );
}
