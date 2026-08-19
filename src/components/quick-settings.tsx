import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { SelectSetting } from '@/components/ui/select-setting';
import { DateTimeButton } from '@/components/ui/date-time-button';
import { SettingsButton } from '@/components/settings-button';
import { useCommonStore } from '@/stores/common-store';
import {
  languageOptions,
  DEFAULT_DIRECTIONS_LANGUAGE,
  type DirectionsLanguage,
} from '@/components/settings-panel/settings-options';
import {
  getDirectionsLanguage,
  setDirectionsLanguage,
} from '@/utils/directions-language';
import { useDirectionsQuery } from '@/hooks/use-directions-queries';
import { useIsochronesQuery } from '@/hooks/use-isochrones-queries';

interface QuickSettingsProps {
  showTravelTime?: boolean;
  showLanguage?: boolean;
}

/**
 * Left-sidebar panel for the settings that are not costing options: departure
 * time and directions language. Everything a Valhalla request carries per
 * target — including `alternates` — lives in the advanced panel, where each
 * target has its own section.
 */
export const QuickSettings = ({
  showTravelTime = true,
  showLanguage = true,
}: QuickSettingsProps) => {
  const search = useSearch({ from: '/$activeTab' });
  const navigate = useNavigate({ from: '/$activeTab' });
  const dateTime = useCommonStore((state) => state.dateTime);
  const updateDateTime = useCommonStore((state) => state.updateDateTime);
  const { refetch: refetchDirections } = useDirectionsQuery();
  const { refetch: refetchIsochrones } = useIsochronesQuery();

  const [open, setOpen] = useState(true);
  const [language, setLanguage] = useState<DirectionsLanguage>(() => {
    // URL wins on first render; otherwise localStorage / system locale.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href).searchParams.get('lang');
      if (url && languageOptions.some((opt) => opt.value === url)) {
        return url as DirectionsLanguage;
      }
    }
    return getDirectionsLanguage();
  });

  // Hydrate from URL on mount (URL wins when present).
  const urlSettingsHydrated = useRef(false);
  useEffect(() => {
    if (urlSettingsHydrated.current) return;
    urlSettingsHydrated.current = true;

    if (search.lang) {
      setDirectionsLanguage(search.lang as DirectionsLanguage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror language → URL (omitted at the default to keep URLs clean).
  useEffect(() => {
    navigate({
      search: (prev) => ({
        ...prev,
        lang: language === DEFAULT_DIRECTIONS_LANGUAGE ? undefined : language,
      }),
      replace: true,
    });
  }, [language, navigate]);

  const refetchAll = useCallback(() => {
    refetchDirections();
    refetchIsochrones();
  }, [refetchDirections, refetchIsochrones]);

  const handleDateTimeChange = useCallback(
    (field: 'type' | 'value', value: string) => {
      updateDateTime(field, value);
      refetchAll();
    },
    [updateDateTime, refetchAll]
  );

  const handleLanguageChange = useCallback(
    (value: string) => {
      const newLanguage = value as DirectionsLanguage;
      setDirectionsLanguage(newLanguage);
      setLanguage(newLanguage);
      refetchDirections();
    },
    [refetchDirections]
  );

  return (
    <div className="flex flex-col gap-2">
      <CollapsibleSection
        title="General settings"
        icon={Settings}
        open={open}
        onOpenChange={setOpen}
        className="bg-muted/60 rounded-md px-3 py-2"
      >
        <div className="space-y-1.25">
          {showTravelTime && (
            <div className="flex items-center justify-end py-1">
              <DateTimeButton
                type={dateTime.type}
                value={dateTime.value}
                onChange={handleDateTimeChange}
              />
            </div>
          )}

          {showLanguage && (
            <SelectSetting
              id="directions-language"
              label="Directions language"
              description="The language used for turn-by-turn navigation instructions."
              placeholder="Select language"
              value={language}
              options={[...languageOptions]}
              onValueChange={handleLanguageChange}
              inline
            />
          )}
        </div>
      </CollapsibleSection>

      <SettingsButton />
    </div>
  );
};
