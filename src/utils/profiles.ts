import type { Profile } from '@/stores/common-store';
import { isValidProfile } from '@/components/utils';

export const DEFAULT_PROFILE: Profile = 'bicycle';

/**
 * Parses a bare comma-separated profile list. The `profile` search param is
 * instance-qualified now (`?profile=public:car`) — see `src/utils/targets.ts`;
 * this stays for callers that only care about the profile half.
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
