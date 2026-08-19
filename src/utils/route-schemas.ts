import { z } from 'zod';
import { fallback } from '@tanstack/zod-adapter';
import { mapStyleSchema } from '../components/map/utils';
import { languageOptions } from '../components/settings-panel/settings-options';
import { DEFAULT_PROFILE } from './profiles';

const languageValues = languageOptions.map((opt) => opt.value) as [
  string,
  ...string[],
];
const languageEnum = z.enum(languageValues);

// Kept as a raw string rather than an array so the URL stays readable
// (`?profile=public:car,local:emergency`). Costing options are per target and
// live in the advanced panel, so none of them appear here any more.
const profileListSchema = z.string().min(1);

export const searchParamsSchema = z.object({
  profile: fallback(profileListSchema.optional(), DEFAULT_PROFILE),
  wps: z.string().optional(),
  range: z.number().optional(),
  interval: z.number().optional(),
  generalize: z.number().optional(),
  denoise: z.number().optional(),
  style: mapStyleSchema.optional(),
  lang: languageEnum.optional(),
});

export type SearchParamsSchema = z.infer<typeof searchParamsSchema>;

export const VALID_TABS = ['directions', 'isochrones', 'tiles'] as const;
export type ValidTab = (typeof VALID_TABS)[number];

export function isValidTab(tab: string): tab is ValidTab {
  return VALID_TABS.includes(tab as ValidTab);
}
