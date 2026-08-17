import type { Profile } from '@/stores/common-store';
import { isValidProfile } from '@/components/utils';

export const DEFAULT_PROFILE: Profile = 'bicycle';

/**
 * The `profile` search param carries every selected costing model as a
 * comma-separated list (`?profile=car,emergency`), so several profiles can be
 * routed and compared at once. A bare `?profile=car` — the format from before
 * multi-select — parses to a one-element list, which keeps old permalinks
 * working.
 */
export const parseProfiles = (param?: string): Profile[] => {
  if (!param) return [];

  const selected = new Set<Profile>();
  for (const name of param.split(',')) {
    const trimmed = name.trim();
    if (isValidProfile(trimmed)) selected.add(trimmed);
  }

  return [...selected];
};

export const serializeProfiles = (profiles: Profile[]): string =>
  profiles.join(',');

/** Same as {@link parseProfiles}, but never empty — the UI always has one profile. */
export const parseProfilesWithFallback = (param?: string): Profile[] => {
  const profiles = parseProfiles(param);
  return profiles.length > 0 ? profiles : [DEFAULT_PROFILE];
};

/**
 * The first selected profile. Settings panels edit its option set, and
 * single-profile operations (optimized route, height graph) run against it.
 */
export const getPrimaryProfile = (profiles: Profile[]): Profile =>
  profiles[0] ?? DEFAULT_PROFILE;

const PROFILE_LABELS: Record<Profile, string> = {
  auto: 'Auto',
  bicycle: 'Bicycle',
  pedestrian: 'Pedestrian',
  car: 'Car',
  truck: 'Truck',
  bus: 'Bus',
  motor_scooter: 'Motor Scooter',
  motorcycle: 'Motorcycle',
  emergency: 'Emergency',
};

export const getProfileLabel = (profile: Profile): string =>
  PROFILE_LABELS[profile];
