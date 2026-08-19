import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  validateBaseUrl,
  normalizeBaseUrl,
  testConnection,
} from '@/utils/base-url';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import {
  Server,
  Plus,
  Trash2,
  Loader2,
  Check,
  TriangleAlert,
} from 'lucide-react';
import {
  useInstancesStore,
  type ValhallaInstance,
} from '@/stores/instances-store';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';

type ConnectionState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok' }
  | { status: 'failed'; error: string };

const InstanceRow = ({
  instance,
  canRemove,
}: {
  instance: ValhallaInstance;
  canRemove: boolean;
}) => {
  const updateInstance = useInstancesStore((state) => state.updateInstance);
  const removeInstance = useInstancesStore((state) => state.removeInstance);

  const [label, setLabel] = useState(instance.label);
  const [url, setUrl] = useState(instance.url);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>({
    status: 'idle',
  });

  const connectionMutation = useMutation({
    mutationFn: testConnection,
    onMutate: () => {
      setConnection({ status: 'testing' });
    },
    onSuccess: (result, testedUrl) => {
      if (result.reachable) {
        updateInstance(instance.id, { url: normalizeBaseUrl(testedUrl) });
        setConnection({ status: 'ok' });
      } else {
        setConnection({
          status: 'failed',
          error: result.error ?? 'Server unreachable',
        });
      }
    },
    onError: (error: Error) => {
      setConnection({
        status: 'failed',
        error: error.message || 'Connection failed',
      });
    },
  });

  const handleUrlBlur = () => {
    const trimmed = url.trim();
    if (trimmed === instance.url) return;

    const validation = validateBaseUrl(trimmed);
    if (!validation.valid) {
      setValidationError(validation.error ?? 'Invalid URL');
      return;
    }

    setValidationError(null);
    connectionMutation.mutate(trimmed);
  };

  return (
    <div className="border-l-2 pl-2" data-testid={`instance-${instance.id}`}>
      <div className="flex items-end gap-1">
        <Field className="flex-1">
          <FieldLabel htmlFor={`instance-label-${instance.id}`}>
            Name
          </FieldLabel>
          <Input
            id={`instance-label-${instance.id}`}
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
            }}
            onBlur={() => {
              updateInstance(instance.id, {
                label: label.trim() || instance.id,
              });
            }}
          />
        </Field>
        <Button
          variant="ghost"
          size="icon"
          disabled={!canRemove}
          title={
            canRemove ? 'Remove instance' : 'At least one instance is required'
          }
          aria-label={`Remove ${instance.label}`}
          data-testid={`remove-instance-${instance.id}`}
          onClick={() => {
            removeInstance(instance.id);
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <Field data-invalid={validationError !== null}>
        <FieldLabel htmlFor={`instance-url-${instance.id}`}>
          Base URL
        </FieldLabel>
        <Input
          id={`instance-url-${instance.id}`}
          value={url}
          aria-invalid={validationError !== null}
          onChange={(e) => {
            setUrl(e.target.value);
            setValidationError(null);
            setConnection({ status: 'idle' });
          }}
          onBlur={handleUrlBlur}
        />
        {validationError !== null && <FieldError>{validationError}</FieldError>}
      </Field>

      <div className="text-muted-foreground flex items-center gap-1 py-1 text-xs">
        {connection.status === 'testing' && (
          <>
            <Loader2 className="size-3 animate-spin" /> Testing…
          </>
        )}
        {connection.status === 'ok' && (
          <>
            <Check className="size-3 text-green-600" /> Reachable
          </>
        )}
        {connection.status === 'failed' && (
          <span className="text-destructive flex items-center gap-1">
            <TriangleAlert className="size-3" /> {connection.error}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * The list of Valhalla servers the app routes against. Each instance can be
 * given its own profiles and costing options, so this is where a comparison
 * between two builds starts.
 */
export const ServerSettings = () => {
  const instances = useInstancesStore((state) => state.instances);
  const addInstance = useInstancesStore((state) => state.addInstance);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <CollapsibleSection
      title="Server Settings"
      icon={Server}
      subtitle={`(${instances.length.toString()})`}
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <div className="flex flex-col gap-3">
        {instances.map((instance) => (
          <InstanceRow
            key={instance.id}
            instance={instance}
            canRemove={instances.length > 1}
          />
        ))}

        <Button
          variant="outline"
          size="sm"
          data-testid="add-instance-button"
          onClick={() => {
            addInstance(
              `Instance ${(instances.length + 1).toString()}`,
              'https://valhalla1.openstreetmap.de'
            );
          }}
        >
          <Plus className="size-3.5" />
          Add instance
        </Button>
      </div>
    </CollapsibleSection>
  );
};
