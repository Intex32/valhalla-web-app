import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SettingRowProps {
  param: string;
  label: string;
  /** Scopes the test id so two targets' rows stay distinguishable. */
  idPrefix?: string;
  /** Whether this option is part of the request at all. */
  included: boolean;
  onIncludedChange: (included: boolean) => void;
  children: ReactNode;
}

/**
 * Wraps a setting control with the checkbox that decides whether it is sent to
 * Valhalla. Unchecked rows are dimmed, so at a glance the panel shows which
 * values are overridden and which are left to the server's own defaults.
 */
export const SettingRow = ({
  param,
  label,
  idPrefix,
  included,
  onIncludedChange,
  children,
}: SettingRowProps) => (
  <div className="flex items-start gap-2">
    <Tooltip>
      <TooltipTrigger asChild>
        <Checkbox
          checked={included}
          onCheckedChange={(checked) => onIncludedChange(checked === true)}
          aria-label={`Send ${label} to Valhalla`}
          data-testid={
            idPrefix ? `include-${idPrefix}-${param}` : `include-${param}`
          }
          className="mt-2"
        />
      </TooltipTrigger>
      <TooltipContent side="left">
        {included
          ? `${label} is sent to Valhalla`
          : `${label} is left at the server default`}
      </TooltipContent>
    </Tooltip>
    <div
      className={cn(
        'min-w-0 flex-1 transition-opacity',
        !included && 'opacity-50'
      )}
    >
      {children}
    </div>
  </div>
);
