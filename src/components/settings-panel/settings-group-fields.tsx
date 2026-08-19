import type { PossibleSettings } from '@/components/types';
import { SliderSetting } from '@/components/ui/slider-setting';
import { CheckboxSetting } from '@/components/ui/checkbox-setting';
import { SelectSetting } from '@/components/ui/select-setting';
import { MultiSelectSetting } from '@/components/ui/multiselect-setting';
import { SettingRow } from './setting-row';
import type { SettingsGroup } from './settings-options';

interface SettingsGroupFieldsProps {
  group: SettingsGroup;
  values: PossibleSettings;
  enabled: Record<string, boolean>;
  /** Params to leave out entirely (e.g. request-level ones). */
  omitParams?: ReadonlySet<string>;
  /**
   * Scopes every control id. Without it two targets rendering the same option
   * produce duplicate DOM ids, and clicking one section's label toggles the
   * other section's control.
   */
  idPrefix?: string;
  /** Writes the value (and opts the option in). No request — drags stay smooth. */
  onValueChange: (
    param: keyof PossibleSettings,
    value: PossibleSettings[keyof PossibleSettings]
  ) => void;
  /** The edit is finished: re-route. Never writes a value of its own. */
  onCommit: () => void;
  onIncludedChange: (param: string, included: boolean) => void;
}

const clamp = (value: number, min: number, max: number) =>
  isNaN(value) ? min : Math.max(min, Math.min(value, max));

/** Renders one settings section: every control paired with its include checkbox. */
export const SettingsGroupFields = ({
  group,
  values,
  enabled,
  omitParams,
  idPrefix,
  onValueChange,
  onCommit,
  onIncludedChange,
}: SettingsGroupFieldsProps) => {
  const isOmitted = (param: string) => omitParams?.has(param) ?? false;
  const controlId = (param: string) =>
    idPrefix ? `${idPrefix}-${param}` : param;

  const commitValue = (
    param: keyof PossibleSettings,
    value: PossibleSettings[keyof PossibleSettings]
  ) => {
    onValueChange(param, value);
    onCommit();
  };

  const row = (param: string, label: string, control: React.ReactNode) => (
    <SettingRow
      key={param}
      param={param}
      label={label}
      idPrefix={idPrefix}
      included={enabled[param] ?? false}
      onIncludedChange={(included) => onIncludedChange(param, included)}
    >
      {control}
    </SettingRow>
  );

  return (
    <div className="space-y-1.25">
      {group.numeric
        .filter((option) => !isOmitted(option.param))
        .map((option) =>
          row(
            option.param,
            option.name,
            <SliderSetting
              id={controlId(option.param)}
              label={option.name}
              description={option.description}
              min={option.settings.min}
              max={option.settings.max}
              step={option.settings.step}
              value={(values[option.param] as number) ?? 0}
              unit={option.unit}
              onValueChange={(next) =>
                onValueChange(option.param, next[0] ?? 0)
              }
              // The value is already written by onValueChange — committing
              // only re-routes, so a drag can't be undone by a stale closure.
              onValueCommit={onCommit}
              onInputChange={(next) =>
                commitValue(
                  option.param,
                  clamp(next[0] ?? 0, option.settings.min, option.settings.max)
                )
              }
            />
          )
        )}

      {group.boolean
        .filter((option) => !isOmitted(option.param))
        .map((option) =>
          row(
            option.param,
            option.name,
            <CheckboxSetting
              id={controlId(option.param)}
              label={option.name}
              description={option.description}
              checked={Boolean(values[option.param])}
              onCheckedChange={(checked) => commitValue(option.param, checked)}
            />
          )
        )}

      {group.enum
        .filter((option) => !isOmitted(option.param))
        .map((option) =>
          row(
            option.param,
            option.name,
            <SelectSetting
              id={controlId(option.param)}
              label={option.name}
              description={option.description}
              placeholder={`Select ${option.name}`}
              value={values[option.param] as string}
              options={option.enums}
              onValueChange={(value) => commitValue(option.param, value)}
            />
          )
        )}

      {group.list
        .filter((option) => !isOmitted(option.param))
        .map((option) =>
          row(
            option.param,
            option.name,
            <MultiSelectSetting
              id={controlId(option.param)}
              label={option.name}
              description={option.description}
              value={(values[option.param] as string[]) ?? ['current']}
              options={option.options}
              onValueChange={(value) => commitValue(option.param, value)}
            />
          )
        )}
    </div>
  );
};
