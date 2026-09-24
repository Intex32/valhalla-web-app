import { useDirectionsStore } from '@/stores/directions-store';
import { SEGMENT_METRICS } from '@/utils/segment-metrics';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RAMP_STOPS } from '@/utils/segment-metrics';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

/**
 * Debugging view: repaints the selected route per maneuver, coloured by a
 * normalised metric. Off by default, and scoped to the selected route, so the
 * ordinary map stays readable.
 */
export const SegmentMetricsControl = () => {
  const segmentMetric = useDirectionsStore((state) => state.segmentMetric);
  const setSegmentMetric = useDirectionsStore(
    (state) => state.setSegmentMetric
  );
  const activeMetric =
    SEGMENT_METRICS.find((metric) => metric.id === segmentMetric) ??
    SEGMENT_METRICS[0];

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="segment-metrics" className="text-sm font-medium">
          Segment metrics
        </Label>
        <Switch
          id="segment-metrics"
          checked={segmentMetric !== null}
          onCheckedChange={(checked) => {
            setSegmentMetric(checked ? (activeMetric?.id ?? null) : null);
          }}
        />
      </div>

      {segmentMetric !== null && activeMetric && (
        <>
          <div className="flex items-center gap-2">
            <Select
              value={segmentMetric}
              onValueChange={(value) => {
                setSegmentMetric(value as typeof segmentMetric);
              }}
            >
              <SelectTrigger id="segment-metric-select" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEGMENT_METRICS.map((metric) => (
                  <SelectItem key={metric.id} value={metric.id}>
                    {metric.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="text-muted-foreground"
                  aria-label={`About ${activeMetric.label}`}
                >
                  <Info className="size-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px]">
                {activeMetric.description}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* The ramp is scaled to the selected route's own min and max, so it
              is always fully used — it says "relative to this route". */}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>low</span>
            <div
              className="h-2 flex-1 rounded-sm"
              style={{
                background: `linear-gradient(to right, ${RAMP_STOPS.join(', ')})`,
              }}
            />
            <span>high</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Selected route only. Click a segment for its exact numbers.
          </p>
        </>
      )}
    </div>
  );
};
