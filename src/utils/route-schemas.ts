import { z } from 'zod';
import { fallback } from '@tanstack/zod-adapter';
import { mapStyleSchema } from '../components/map/utils';
import { languageOptions } from '../components/settings-panel/settings-options';
import { DEFAULT_PROFILE, parseProfiles } from './profiles';

const languageValues = languageOptions.map((opt) => opt.value) as [
  string,
  ...string[],
];
const languageEnum = z.enum(languageValues);

// Valhalla accepts any willingness in 0..1. The QuickSettings buttons only
// produce 0 / 0.5 / 1, but the advanced panel exposes the same params as
// 0.1-step sliders, so the permalink has to carry whatever the slider lands on.
const willingness = z.number().min(0).max(1);

// Kept as a raw string rather than an array so the URL stays readable
// (`?profile=car,emergency`); use `parseProfiles` to get the list back.
const profileListSchema = z.string().refine(
  (value) => parseProfiles(value).length > 0,
  (value) => ({ message: `no known costing profile in "${value}"` })
);

export const searchParamsSchema = z.object({
  profile: fallback(profileListSchema.optional(), DEFAULT_PROFILE),
  wps: z.string().optional(),
  range: z.number().optional(),
  interval: z.number().optional(),
  generalize: z.number().optional(),
  denoise: z.number().optional(),
  style: mapStyleSchema.optional(),
  // Dropped rather than fatal when a hand-edited permalink is out of range.
  use_ferry: fallback(willingness.optional(), undefined),
  use_highways: fallback(willingness.optional(), undefined),
  use_tolls: fallback(willingness.optional(), undefined),
  alternates: fallback(z.number().int().min(0).max(5).optional(), undefined),
  lang: languageEnum.optional(),
});

export type SearchParamsSchema = z.infer<typeof searchParamsSchema>;

export const VALID_TABS = ['directions', 'isochrones', 'tiles'] as const;
export type ValidTab = (typeof VALID_TABS)[number];

export function isValidTab(tab: string): tab is ValidTab {
  return VALID_TABS.includes(tab as ValidTab);
}
