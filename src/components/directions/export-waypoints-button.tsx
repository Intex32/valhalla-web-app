import { useCallback, useState } from 'react';
import { ClipboardCopy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDirectionsStore } from '@/stores/directions-store';
import { getActiveWaypoints } from '@/hooks/use-directions-queries';
import type { ActiveWaypoint } from '@/components/types';

/**
 * `unixtimestamp,start_lat,start_lon,end_lat,end_lon`.
 *
 * Every coordinate the app stores is `[lng, lat]`, but this format is lat
 * first — hence the deliberate index flip. A swap here produces output that
 * still looks like valid coordinates, so it would go unnoticed.
 */
export const formatWaypointExport = (
  start: ActiveWaypoint,
  end: ActiveWaypoint,
  unixSeconds: number
): string =>
  [
    unixSeconds,
    start.displaylnglat[1].toFixed(6),
    start.displaylnglat[0].toFixed(6),
    end.displaylnglat[1].toFixed(6),
    end.displaylnglat[0].toFixed(6),
  ].join(',');

export const ExportWaypointsButton = () => {
  const waypoints = useDirectionsStore((state) => state.waypoints);
  const [copied, setCopied] = useState(false);

  // Derived exactly the way the requests derive them, so the export always
  // describes the trip that was actually routed.
  const active = getActiveWaypoints(waypoints);
  const start = active[0];
  const end = active[active.length - 1];
  const canExport =
    active.length >= 2 && start !== undefined && end !== undefined;
  // The format carries only start and end; any intermediate stops are dropped.
  const viaCount = Math.max(0, active.length - 2);

  const handleCopy = useCallback(async () => {
    if (!canExport) return;

    const text = formatWaypointExport(
      start,
      end,
      Math.floor(Date.now() / 1000)
    );

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1000);
    } catch (error) {
      console.error('Failed to copy waypoints:', error);
    }
  }, [canExport, start, end]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button
            variant="outline"
            className="w-full"
            disabled={!canExport}
            onClick={() => void handleCopy()}
            data-testid="export-waypoints-button"
          >
            {copied ? (
              <Check className="size-4" />
            ) : (
              <ClipboardCopy className="size-4" />
            )}
            {copied ? 'Copied!' : 'Copy Start / Destination'}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          Copies <code>unixtimestamp,start_lat,start_lon,end_lat,end_lon</code>
          {viaCount > 0 &&
            ` — the ${viaCount.toString()} waypoint${viaCount === 1 ? '' : 's'} in between are not included`}
        </p>
      </TooltipContent>
    </Tooltip>
  );
};
