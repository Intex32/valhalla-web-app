import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { targetParams } from '@/utils/build-costing-options';
import { REQUEST_LEVEL_PARAMS } from './settings-options';
import type { PossibleSettings } from '@/components/types';
import type { ScopedSettings } from '@/stores/common-store';
import { targetKey, type TargetRef } from '@/utils/targets';

/**
 * The exported file speaks Valhalla's language, not the panel's: every key is
 * the costing option's API `param`, nested exactly where a `/route` request
 * carries it. `values` holds every option the costing model understands so
 * nothing is lost in a round trip, while `enabled` records which of them are
 * actually sent — the panel's include ticks, which have no API equivalent.
 */
interface ExportedSettings {
  costing: string;
  costing_options: Record<string, Record<string, unknown>>;
  enabled: string[];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Pulls the costing options out of whatever shape was dropped in: our own
 * export, a bare `costing_options` block, a single costing model's object, or
 * a flat map of params. Hand-written Valhalla payloads import as readily as
 * exported ones.
 */
const readCostingOptions = (
  parsed: unknown,
  profile: string
): Record<string, unknown> | null => {
  if (!isPlainObject(parsed)) return null;

  const options = parsed.costing_options ?? parsed;
  if (!isPlainObject(options)) return null;

  // `{ emergency: { … } }`, from us or from a request body.
  const forProfile = options[profile];
  if (isPlainObject(forProfile)) return forProfile;

  // A lone costing model under some other name is still unambiguous.
  const models = Object.values(options).filter(isPlainObject);
  if (models.length === 1 && models[0]) return models[0];

  // Otherwise assume a flat `{ param: value }` map.
  return options;
};

interface CostingSettingsIOProps {
  target: TargetRef;
  scope: ScopedSettings;
  onValueChange: (
    param: keyof PossibleSettings,
    value: PossibleSettings[keyof PossibleSettings]
  ) => void;
  onIncludedChange: (param: string, included: boolean) => void;
  /** Re-route once, after the whole file has been applied. */
  onCommit: () => void;
}

/**
 * Export / import one target's costing options as JSON. The `emergency`
 * profile carries a pile of fork-specific tuning that is worth saving and
 * sharing verbatim, so it is the only profile that gets these buttons.
 */
export const CostingSettingsIO = ({
  target,
  scope,
  onValueChange,
  onIncludedChange,
  onCommit,
}: CostingSettingsIOProps) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const key = targetKey(target);

  // Request-level params ride along in the request, not in `costing_options`.
  const params = targetParams(target.profile).filter(
    (param) => !(REQUEST_LEVEL_PARAMS as readonly string[]).includes(param)
  );

  const handleExport = useCallback(() => {
    const values: Record<string, unknown> = {};
    for (const param of params) {
      values[param] = scope.values[param as keyof PossibleSettings];
    }

    const payload: ExportedSettings = {
      costing: target.profile,
      costing_options: { [target.profile]: values },
      enabled: params.filter((param) => scope.enabled[param]),
    };

    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${key}-costing-settings.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [params, scope, target.profile, key]);

  const applyImport = useCallback(
    (text: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        toast.error('Import failed', {
          description: 'That file is not valid JSON.',
        });
        return;
      }

      const options = readCostingOptions(parsed, target.profile);
      if (!options) {
        toast.error('Import failed', {
          description: 'No costing options found in that file.',
        });
        return;
      }

      const known = new Set(params);
      // An explicit `enabled` list is our own export; a hand-written payload
      // has none, and there every option present is one meant to be sent.
      const enabled: string[] | null =
        isPlainObject(parsed) && Array.isArray(parsed.enabled)
          ? parsed.enabled.filter(
              (param): param is string => typeof param === 'string'
            )
          : null;

      const applied: string[] = [];
      const skipped: string[] = [];

      for (const [param, value] of Object.entries(options)) {
        if (!known.has(param)) {
          skipped.push(param);
          continue;
        }
        const current = scope.values[param as keyof PossibleSettings];
        // Guard the control, not the wire: feeding a slider a string would
        // render a broken row rather than a wrong route.
        if (typeof value !== typeof current && current !== undefined) {
          skipped.push(param);
          continue;
        }
        onValueChange(
          param as keyof PossibleSettings,
          value as PossibleSettings[keyof PossibleSettings]
        );
        onIncludedChange(param, enabled ? enabled.includes(param) : true);
        applied.push(param);
      }

      if (applied.length === 0) {
        toast.error('Import failed', {
          description: `Nothing in that file applies to ${target.profile}.`,
        });
        return;
      }

      onCommit();
      toast.success(
        `Imported ${applied.length.toString()} costing option${
          applied.length === 1 ? '' : 's'
        }`,
        skipped.length > 0
          ? { description: `Ignored: ${skipped.join(', ')}` }
          : undefined
      );
    },
    [params, scope, target.profile, onValueChange, onIncludedChange, onCommit]
  );

  return (
    <div className="flex gap-2 pt-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        data-testid={`export-settings-${key}`}
      >
        <Download className="size-3.5" />
        Export
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInput.current?.click()}
        data-testid={`import-settings-${key}`}
      >
        <Upload className="size-3.5" />
        Import
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        data-testid={`import-settings-input-${key}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset first, so re-picking the same file fires `change` again.
          event.target.value = '';
          if (file) void file.text().then(applyImport);
        }}
      />
    </div>
  );
};
