import { useMemo } from 'react';
import { useSearch } from '@tanstack/react-router';
import type { Profile } from '@/stores/common-store';
import { getPrimaryProfile, parseProfilesWithFallback } from '@/utils/profiles';

/** Every costing profile currently selected in the picker, in selection order. */
export function useSelectedProfiles(): Profile[] {
  const { profile } = useSearch({ from: '/$activeTab' });
  return useMemo(() => parseProfilesWithFallback(profile), [profile]);
}

/** The profile that settings panels and single-profile actions apply to. */
export function usePrimaryProfile(): Profile {
  return getPrimaryProfile(useSelectedProfiles());
}
