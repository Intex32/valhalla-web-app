import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { normalizeBaseUrl } from '@/utils/base-url';
import { isValidInstanceId, slugifyInstanceId } from '@/utils/targets';

/** One Valhalla server the app can route against. */
export interface ValhallaInstance {
  /** Slug — ends up in DOM ids and the `profile` search param, so keep it safe. */
  id: string;
  label: string;
  url: string;
}

const STORAGE_KEY = 'valhalla_instances';
/** The single-server setting this list replaces; migrated on first read. */
const LEGACY_BASE_URL_KEY = 'valhalla_base_url';

const PUBLIC_URL = 'https://valhalla1.openstreetmap.de';
const LOCAL_URL =
  import.meta.env.VITE_VALHALLA_URL || 'http://localhost:3000/valhalla';

const defaultInstances = (): ValhallaInstance[] => {
  const instances: ValhallaInstance[] = [
    { id: 'public', label: 'Public', url: PUBLIC_URL },
  ];

  // Whatever the old single-server setting pointed at becomes the local entry,
  // so an existing user's server survives the upgrade.
  const legacy =
    typeof window === 'undefined'
      ? null
      : localStorage.getItem(LEGACY_BASE_URL_KEY);

  const localUrl = legacy ?? LOCAL_URL;
  if (localUrl !== PUBLIC_URL) {
    instances.push({ id: 'local', label: 'Local', url: localUrl });
  }

  return instances;
};

interface InstancesState {
  instances: ValhallaInstance[];
}

interface InstancesActions {
  addInstance: (label: string, url: string) => string;
  updateInstance: (
    id: string,
    patch: Partial<Omit<ValhallaInstance, 'id'>>
  ) => void;
  removeInstance: (id: string) => void;
}

type InstancesStore = InstancesState & InstancesActions;

/** Unique within the list — ids are referenced by URLs and stored settings. */
const uniqueId = (base: string, taken: string[]): string => {
  const seed = isValidInstanceId(base) ? base : slugifyInstanceId(base);
  if (!taken.includes(seed)) return seed;

  let suffix = 2;
  while (taken.includes(`${seed}-${suffix.toString()}`)) suffix += 1;
  return `${seed}-${suffix.toString()}`;
};

export const useInstancesStore = create<InstancesStore>()(
  devtools(
    persist(
      immer((set) => ({
        instances: defaultInstances(),

        addInstance: (label, url) => {
          const id = uniqueId(
            slugifyInstanceId(label),
            useInstancesStore.getState().instances.map((i) => i.id)
          );
          set(
            (state) => {
              state.instances.push({
                id,
                label: label.trim() === '' ? id : label.trim(),
                url: normalizeBaseUrl(url),
              });
            },
            undefined,
            'addInstance'
          );
          return id;
        },

        updateInstance: (id, patch) =>
          set(
            (state) => {
              const instance = state.instances.find((i) => i.id === id);
              if (!instance) return;
              // The id is deliberately immutable: settings, results and
              // permalinks are all keyed by it.
              if (patch.label !== undefined) instance.label = patch.label;
              if (patch.url !== undefined) {
                instance.url = normalizeBaseUrl(patch.url);
              }
            },
            undefined,
            'updateInstance'
          ),

        removeInstance: (id) =>
          set(
            (state) => {
              // Never leave the app with nothing to route against.
              if (state.instances.length <= 1) return;
              state.instances = state.instances.filter((i) => i.id !== id);
            },
            undefined,
            'removeInstance'
          ),
      })),
      {
        name: STORAGE_KEY,
        partialize: (state) => ({ instances: state.instances }),
        merge: (persisted, current) => {
          const stored = (persisted as InstancesState | undefined)?.instances;
          const usable =
            Array.isArray(stored) &&
            stored.length > 0 &&
            stored.every((i) => isValidInstanceId(i.id) && i.url);
          return { ...current, instances: usable ? stored : current.instances };
        },
      }
    ),
    { name: 'instances' }
  )
);

/** Instance ids in display order — the order targets are grouped and coloured by. */
export const getInstanceIds = (instances: ValhallaInstance[]): string[] =>
  instances.map((instance) => instance.id);

export const findInstance = (
  instances: ValhallaInstance[],
  id: string
): ValhallaInstance | undefined => instances.find((i) => i.id === id);

/** Position in the list, which drives the colour shade for that instance. */
export const instanceIndex = (
  instances: ValhallaInstance[],
  id: string
): number =>
  Math.max(
    0,
    instances.findIndex((i) => i.id === id)
  );
