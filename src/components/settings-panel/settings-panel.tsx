import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  generalSettings,
  getProfileSettingsGroup,
  REQUEST_LEVEL_PARAMS,
  type SettingsGroup,
} from './settings-options';
import { buildCostingOptions } from '@/utils/build-costing-options';
import type { PossibleSettings } from '@/components/types';

import { CheckboxSetting } from '@/components/ui/checkbox-setting';
import { SliderSetting } from '@/components/ui/slider-setting';
import { SettingsGroupFields } from './settings-group-fields';
import {
  useCommonStore,
  getTargetScope,
  type ScopedSettings,
} from '@/stores/common-store';
import { useInstancesStore, instanceIndex } from '@/stores/instances-store';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { X, Copy, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useParams } from '@tanstack/react-router';
import { useSelectedTargets } from '@/hooks/use-selected-targets';
import { useDirectionsQuery } from '@/hooks/use-directions-queries';
import { useIsochronesQuery } from '@/hooks/use-isochrones-queries';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { ServerSettings } from '@/components/settings-panel/server-settings';
import { getTargetColor } from '@/utils/profile-colors';
import { getProfileLabel } from '@/utils/profiles';
import { targetKey, type TargetRef } from '@/utils/targets';

// Request-level params are always sent, so they get no include checkbox —
// `alternates` has its own slider instead.
const OMITTED_PARAMS: ReadonlySet<string> = new Set(REQUEST_LEVEL_PARAMS);

/**
 * Every option one target can be given, in one section: nothing is shared
 * between targets, so a profile's general options are repeated per instance
 * and can be tuned independently on each server.
 */
const targetGroup = (target: TargetRef): SettingsGroup => {
  const own = getProfileSettingsGroup(target.profile);
  const general =
    target.profile === 'auto'
      ? { numeric: [], boolean: [], enum: [], list: [] }
      : generalSettings[target.profile];

  const seen = new Set<string>();
  const merge = <T extends { param: string }>(a: T[], b: T[]): T[] =>
    [...a, ...b].filter((option) => {
      if (seen.has(option.param)) return false;
      seen.add(option.param);
      return true;
    });

  return {
    numeric: merge(general.numeric, own.numeric),
    boolean: merge(general.boolean, own.boolean),
    enum: merge(general.enum, own.enum),
    list: merge(general.list, own.list),
  };
};

export const SettingsPanel = () => {
  const selectedTargets = useSelectedTargets();
  const { activeTab } = useParams({ from: '/$activeTab' });
  const perTarget = useCommonStore((state) => state.perTarget);
  const excludePolygons = useCommonStore((state) => state.excludePolygons);
  const useGeocoding = useCommonStore((state) => state.useGeocoding);
  const setUseGeocoding = useCommonStore((state) => state.setUseGeocoding);
  const settingsPanelOpen = useCommonStore((state) => state.settingsPanelOpen);
  const updateTargetSetting = useCommonStore(
    (state) => state.updateTargetSetting
  );
  const setTargetEnabled = useCommonStore((state) => state.setTargetEnabled);
  const resetSettings = useCommonStore((state) => state.resetSettings);
  const toggleSettings = useCommonStore((state) => state.toggleSettings);
  const instances = useInstancesStore((state) => state.instances);
  const [copied, setCopied] = useState(false);
  const { refetch: refetchDirections } = useDirectionsQuery();
  const { refetch: refetchIsochrones } = useIsochronesQuery();

  const [openTargets, setOpenTargets] = useState<Record<string, boolean>>({});

  const makeRequest = useCallback(() => {
    if (activeTab === 'directions') {
      refetchDirections();
    } else {
      refetchIsochrones();
    }
  }, [activeTab, refetchDirections, refetchIsochrones]);

  const handleCopySettings = useCallback(async () => {
    const payload = Object.fromEntries(
      selectedTargets.map((target) => [
        targetKey(target),
        buildCostingOptions(
          target.profile,
          getTargetScope(perTarget, target),
          excludePolygons
        ).costing,
      ])
    );
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1000);
    } catch (error) {
      console.error('Failed to copy settings:', error);
    }
  }, [selectedTargets, perTarget, excludePolygons]);

  const handleReset = useCallback(() => {
    resetSettings(selectedTargets);
    makeRequest();
  }, [resetSettings, selectedTargets, makeRequest]);

  return (
    <Sheet open={settingsPanelOpen} modal={false}>
      <SheetContent
        side="right"
        className="w-[350px] pb-6 sm:max-w-[unset] max-h-screen overflow-y-scroll"
      >
        <SheetHeader className="justify-between">
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription className="sr-only">
            Costing options for the selected targets
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
            that server&apos;s own default for that costing model.
          </p>

          {selectedTargets.map((target) => (
            <TargetSection
              key={targetKey(target)}
              target={target}
              instanceLabel={
                instances.find((i) => i.id === target.instanceId)?.label ??
                target.instanceId
              }
              color={getTargetColor(
                instanceIndex(instances, target.instanceId),
                target.profile
              )}
              scope={getTargetScope(perTarget, target)}
              open={openTargets[targetKey(target)] ?? true}
              onOpenChange={(next) => {
                setOpenTargets((prev) => ({
                  ...prev,
                  [targetKey(target)]: next,
                }));
              }}
              onValueChange={(param, value) => {
                updateTargetSetting(target, param, value);
              }}
              onCommit={makeRequest}
              onIncludedChange={(param, included) => {
                setTargetEnabled(target, param, included);
                makeRequest();
              }}
            />
          ))}

          {/* Client-side only, so it gets no include checkbox. */}
          <CheckboxSetting
            id="use_geocoding"
            label="Geocoding"
            description="Decides whether you want to use geocoding or work with plain coordinates."
            checked={useGeocoding}
            onCheckedChange={setUseGeocoding}
          />

          <div className="flex gap-2 pt-1">
            <Button
              variant={copied ? 'default' : 'outline'}
              size="sm"
              onClick={() => void handleCopySettings()}
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

interface TargetSectionProps {
  target: TargetRef;
  instanceLabel: string;
  color: string;
  scope: ScopedSettings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onValueChange: (
    param: keyof PossibleSettings,
    value: PossibleSettings[keyof PossibleSettings]
  ) => void;
  onCommit: () => void;
  onIncludedChange: (param: string, included: boolean) => void;
}

const TargetSection = ({
  target,
  instanceLabel,
  color,
  scope,
  open,
  onOpenChange,
  onValueChange,
  onCommit,
  onIncludedChange,
}: TargetSectionProps) => {
  const group = targetGroup(target);
  const key = targetKey(target);
  const params = [
    ...group.numeric,
    ...group.boolean,
    ...group.enum,
    ...group.list,
  ]
    .map((option) => option.param)
    .filter((param) => !OMITTED_PARAMS.has(param));
  const enabled = params.filter((param) => scope.enabled[param]).length;

  return (
    // The left edge carries the target's map colour, tying the section to the
    // routes and polygons it governs.
    <div
      className="border-l-2 pl-2"
      style={{ borderLeftColor: color }}
      data-testid={`target-settings-${key}`}
    >
      <CollapsibleSection
        title={`${instanceLabel} · ${getProfileLabel(target.profile)}`}
        icon={SlidersHorizontal}
        subtitle={`(${enabled.toString()}/${params.length.toString()})`}
        open={open}
        onOpenChange={onOpenChange}
      >
        {/* Request-level rather than a costing option, so it is always sent
            and needs no checkbox. Off by default: comparing servers is about
            the main route. */}
        <SliderSetting
          id={`alternates-${key}`}
          label="Alternative routes"
          description="How many alternative routes to request from this server for this profile."
          min={0}
          max={5}
          step={1}
          value={(scope.values.alternates as number) ?? 0}
          unit="routes"
          onValueChange={(values) => {
            onValueChange('alternates', values[0] ?? 0);
          }}
          onValueCommit={onCommit}
          onInputChange={(values) => {
            let parsed = values[0] ?? 0;
            if (isNaN(parsed)) parsed = 0;
            onValueChange('alternates', Math.max(0, Math.min(parsed, 5)));
            onCommit();
          }}
        />

        <SettingsGroupFields
          group={group}
          values={scope.values}
          enabled={scope.enabled}
          omitParams={OMITTED_PARAMS}
          idPrefix={key}
          onValueChange={onValueChange}
          onCommit={onCommit}
          onIncludedChange={onIncludedChange}
        />
      </CollapsibleSection>
    </div>
  );
};
