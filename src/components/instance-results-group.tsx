import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { useInstancesStore, findInstance } from '@/stores/instances-store';
import { getProfileLabel } from '@/utils/profiles';
import type { TargetRef } from '@/utils/targets';

interface UnsupportedFailure {
  target: TargetRef;
  kind: 'unsupported' | 'error';
  message: string;
}

/**
 * Results for one Valhalla instance, with an info banner naming any selected
 * profile that server has no costing model for — the difference between "this
 * server routes it differently" and "this server cannot route it at all".
 */
export const InstanceResultsGroup = ({
  instanceId,
  failures,
  children,
}: {
  instanceId: string;
  failures: UnsupportedFailure[];
  children: ReactNode;
}) => {
  const instances = useInstancesStore((state) => state.instances);
  const instance = findInstance(instances, instanceId);
  const unsupported = failures.filter(
    (failure) =>
      failure.target.instanceId === instanceId && failure.kind === 'unsupported'
  );

  return (
    <div
      className="flex flex-col gap-2"
      data-testid={`instance-group-${instanceId}`}
    >
      <div className="flex items-baseline justify-between gap-2 border-b pb-1">
        <span className="text-sm font-semibold">
          {instance?.label ?? instanceId}
        </span>
        <span
          className="text-muted-foreground truncate text-xs"
          title={instance?.url}
        >
          {instance?.url}
        </span>
      </div>

      {unsupported.length > 0 && (
        <div
          className="bg-muted/60 text-muted-foreground flex items-start gap-2 rounded-md p-2 text-xs"
          data-testid={`unsupported-banner-${instanceId}`}
        >
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {instance?.label ?? instanceId} has no costing model for{' '}
            <strong>
              {unsupported
                .map((failure) => getProfileLabel(failure.target.profile))
                .join(', ')}
            </strong>
            , so {unsupported.length === 1 ? 'it was' : 'they were'} skipped on
            this server.
          </span>
        </div>
      )}

      {children}
    </div>
  );
};
