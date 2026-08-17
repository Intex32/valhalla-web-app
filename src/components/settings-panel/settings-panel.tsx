import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  generalSettings,
  getProfileSettingsGroup,
  getSharedSettingsGroup,
  REQUEST_LEVEL_PARAMS,
} from './settings-options';
import { buildCostingOptions } from '@/utils/build-costing-options';
import type { PossibleSettings } from '@/components/types';

import { CheckboxSetting } from '@/components/ui/checkbox-setting';
import { SettingsGroupFields } from './settings-group-fields';
import {
  useCommonStore,
  getProfileScope,
  type Profile,
} from '@/stores/common-store';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { X, Copy, RotateCcw, SlidersHorizontal, Share2 } from 'lucide-react';
import { useParams } from '@tanstack/react-router';
import { useSelectedProfiles } from '@/hooks/use-selected-profiles';
import { useDirectionsQuery } from '@/hooks/use-directions-queries';
import { useIsochronesQuery } from '@/hooks/use-isochrones-queries';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { ServerSettings } from '@/components/settings-panel/server-settings';
import { getProfileColor } from '@/utils/profile-colors';
import { getProfileLabel } from '@/utils/profiles';

// Everything else keeps a checkbox here — including the willingness params the
// QuickSettings buttons also write, since those buttons have no "leave at the
// server default" state and this panel is where that is controlled.
const OMITTED_PARAMS: ReadonlySet<string> = new Set(REQUEST_LEVEL_PARAMS);

export const SettingsPanel = () => {
  const selectedProfiles = useSelectedProfiles();
  const { activeTab } = useParams({ from: '/$activeTab' });
  const shared = useCommonStore((state) => state.shared);
  const perProfile = useCommonStore((state) => state.perProfile);
  const settingsPanelOpen = useCommonStore((state) => state.settingsPanelOpen);
  const updateSharedSetting = useCommonStore(
    (state) => state.updateSharedSetting
  );
  const setSharedEnabled = useCommonStore((state) => state.setSharedEnabled);
  const updateProfileSetting = useCommonStore(
    (state) => state.updateProfileSetting
  );
  const setProfileEnabled = useCommonStore((state) => state.setProfileEnabled);
  const resetSettings = useCommonStore((state) => state.resetSettings);
  const toggleSettings = useCommonStore((state) => state.toggleSettings);
  const [copied, setCopied] = useState(false);
  const { refetch: refetchDirections } = useDirectionsQuery();
  const { refetch: refetchIsochrones } = useIsochronesQuery();

  const [sharedOpen, setSharedOpen] = useState(true);
  const [openProfiles, setOpenProfiles] = useState<Record<string, boolean>>({});

  const sharedGroup = useMemo(
    () => getSharedSettingsGroup(selectedProfiles),
    [selectedProfiles]
  );

  const makeRequest = useCallback(() => {
    if (activeTab === 'directions') {
      refetchDirections();
    } else {
      refetchIsochrones();
    }
  }, [activeTab, refetchDirections, refetchIsochrones]);

  const handleCopySettings = useCallback(async () => {
    const payload = Object.fromEntries(
      selectedProfiles.map((profile) => [
        profile,
        buildCostingOptions(profile, { shared, perProfile }).costing,
      ])
    );
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 1000);
  }, [selectedProfiles, shared, perProfile]);

  const handleReset = useCallback(() => {
    resetSettings(selectedProfiles);
    makeRequest();
  }, [resetSettings, selectedProfiles, makeRequest]);

  const enabledCount = (enabled: Record<string, boolean>, params: string[]) =>
    params.filter((param) => enabled[param]).length;

  const sharedParams = [
    ...sharedGroup.numeric,
    ...sharedGroup.boolean,
    ...sharedGroup.enum,
    ...sharedGroup.list,
  ]
    .map((option) => option.param)
    .filter((param) => !OMITTED_PARAMS.has(param));

  return (
    <Sheet open={settingsPanelOpen} modal={false}>
      <SheetContent
        side="right"
        className="w-[350px] pb-6 sm:max-w-[unset] max-h-screen overflow-y-scroll"
      >
        <SheetHeader className="justify-between">
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription className="sr-only">
            Costing options for the selected profiles
          </SheetDescription>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSettings}
            data-testid="close-settings-button"
          >
            <X className="size-4" />
          </Button>
        </SheetHeader>
        <div className="px-3 space-y-3">
          <ServerSettings />

          <p className="text-muted-foreground text-xs">
            Only ticked options are sent to Valhalla. Everything else is left to
            the server&apos;s own default for that costing model.
          </p>

          <CollapsibleSection
            title="Shared settings"
            icon={Share2}
            subtitle={`(${enabledCount(shared.enabled, sharedParams).toString()}/${sharedParams.length.toString()})`}
            open={sharedOpen}
            onOpenChange={setSharedOpen}
          >
            <SettingsGroupFields
              group={sharedGroup}
              values={shared.values}
              enabled={shared.enabled}
              omitParams={OMITTED_PARAMS}
              onValueChange={updateSharedSetting}
              onCommit={makeRequest}
              onIncludedChange={(param, included) => {
                setSharedEnabled(param, included);
                makeRequest();
              }}
            />
            {/* Client-side only, so it gets no include checkbox. */}
            {generalSettings.all.boolean.map((option) => (
              <CheckboxSetting
                key={option.param}
                id={option.param}
                label={option.name}
                description={option.description}
                checked={Boolean(shared.values[option.param])}
                onCheckedChange={(checked) => {
                  updateSharedSetting(option.param, checked);
                }}
              />
            ))}
          </CollapsibleSection>

          {selectedProfiles.map((profile) => (
            <ProfileSection
              key={profile}
              profile={profile}
              open={openProfiles[profile] ?? true}
              onOpenChange={(next) => {
                setOpenProfiles((prev) => ({ ...prev, [profile]: next }));
              }}
              perProfile={perProfile}
              onValueChange={(param, value) => {
                updateProfileSetting(profile, param, value);
              }}
              onCommit={makeRequest}
              onIncludedChange={(param, included) => {
                setProfileEnabled(profile, param, included);
                makeRequest();
              }}
            />
          ))}

          <div className="flex gap-2 pt-1">
            <Button
              variant={copied ? 'default' : 'outline'}
              size="sm"
              onClick={handleCopySettings}
              className={copied ? 'bg-green-600 hover:bg-green-600' : ''}
            >
              <Copy className="size-3.5" />
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

interface ProfileSectionProps {
  profile: Profile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  perProfile: Partial<Record<Profile, ReturnType<typeof getProfileScope>>>;
  onValueChange: (
    param: keyof PossibleSettings,
    value: PossibleSettings[keyof PossibleSettings]
  ) => void;
  onCommit: () => void;
  onIncludedChange: (param: string, included: boolean) => void;
}

const ProfileSection = ({
  profile,
  open,
  onOpenChange,
  perProfile,
  onValueChange,
  onCommit,
  onIncludedChange,
}: ProfileSectionProps) => {
  const group = getProfileSettingsGroup(profile);
  const scope = getProfileScope(perProfile, profile);
  const params = [
    ...group.numeric,
    ...group.boolean,
    ...group.enum,
    ...group.list,
  ].map((option) => option.param);
  const enabled = params.filter((param) => scope.enabled[param]).length;

  if (params.length === 0) return null;

  return (
    // The left edge carries the profile's map colour, tying the section to the
    // routes and polygons it governs.
    <div
      className="border-l-2 pl-2"
      style={{ borderLeftColor: getProfileColor(profile) }}
      data-testid={`profile-settings-${profile}`}
    >
      <CollapsibleSection
        title={`${getProfileLabel(profile)} settings`}
        icon={SlidersHorizontal}
        subtitle={`(${enabled.toString()}/${params.length.toString()})`}
        open={open}
        onOpenChange={onOpenChange}
      >
        <SettingsGroupFields
          group={group}
          values={scope.values}
          enabled={scope.enabled}
          onValueChange={onValueChange}
          onCommit={onCommit}
          onIncludedChange={onIncludedChange}
        />
      </CollapsibleSection>
    </div>
  );
};
