import { SEGMENT_METRICS, RAMP_STOPS } from '@/utils/segment-metrics';
import {
  useSegmentMetricsStore,
  getSegmentRange,
  type MetricRange,
} from '@/stores/segment-metrics-store';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { Info, RotateCcw } from 'lucide-react';

interface RangeFieldsProps {
  idPrefix: string;
  label: string;
  unit: string;
  range: MetricRange;
  onChange: (range: Partial<MetricRange>) => void;
}

/**
 * The two ends of one scale. Edits are applied per keystroke so the map
 * follows along; a blank or half-typed field is ignored rather than snapping
 * the bound to zero mid-edit.
 */
const RangeFields = ({
  idPrefix,
  label,
  unit,
  range,
  onChange,
}: RangeFieldsProps) => {
  const field = (bound: 'min' | 'max') => (
    <div className="flex items-center gap-1">
      <Label
        htmlFor={`${idPrefix}-${bound}`}
        className="text-[10px] text-muted-foreground"
      >
        {bound}
      </Label>
      <Input
        id={`${idPrefix}-${bound}`}
        data-testid={`${idPrefix}-${bound}`}
        type="number"
        className="h-7 w-20 text-xs"
        value={range[bound]}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (event.target.value === '' || isNaN(parsed)) return;
          onChange({ [bound]: parsed });
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">
        {label} ({unit})
      </span>
      <div className="flex items-center gap-2">
        {field('min')}
        {field('max')}
      </div>
    </div>
  );
};

/**
 * Debugging view: repaints the selected route per maneuver (or per graph edge
 * once the trace lands), coloured by a normalised metric. Off by default, and
 * scoped to the selected route, so the ordinary map stays readable.
 *
 * The scales are absolute and editable — see `segment-metrics-store`.
 */
export const SegmentMetricsControl = () => {
  const segmentMetric = useSegmentMetricsStore((state) => state.segmentMetric);
  const setSegmentMetric = useSegmentMetricsStore(
    (state) => state.setSegmentMetric
  );
  const showIntersections = useSegmentMetricsStore(
    (state) => state.showIntersectionCosts
  );
  const setShowIntersections = useSegmentMetricsStore(
    (state) => state.setShowIntersectionCosts
  );
  const segmentRanges = useSegmentMetricsStore((state) => state.segmentRanges);
  const nodeRanges = useSegmentMetricsStore((state) => state.nodeRanges);
  const setSegmentRange = useSegmentMetricsStore(
    (state) => state.setSegmentRange
  );
  const setNodeRange = useSegmentMetricsStore((state) => state.setNodeRange);
  const resetRanges = useSegmentMetricsStore((state) => state.resetRanges);

  const activeMetric =
    SEGMENT_METRICS.find((metric) => metric.id === segmentMetric) ??
    SEGMENT_METRICS[0];
  const activeRange = activeMetric
    ? getSegmentRange(segmentRanges, activeMetric.id)
    : null;
  // Junctions only carry a value for the metrics that share its direction.
  const encoding = activeMetric?.intersection ?? 'none';
  const nodeScale =
    encoding === 'none'
      ? null
      : {
          kind: encoding,
          range: nodeRanges[encoding],
          label:
            encoding === 'cost'
              ? 'Intersection scale · transition cost'
              : 'Intersection scale · transition time',
          unit: encoding === 'cost' ? 'cost' : 's',
        };

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

      {segmentMetric !== null && activeMetric && activeRange && (
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

          {/* The scale is fixed, so the legend can show the actual numbers
              rather than "low" and "high". */}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="font-mono">{activeRange.min}</span>
            <div
              className="h-2 flex-1 rounded-sm"
              style={{
                background: `linear-gradient(to right, ${RAMP_STOPS.join(', ')})`,
              }}
            />
            <span className="font-mono">{activeRange.max}</span>
          </div>

          <RangeFields
            idPrefix={`segment-range-${activeMetric.id}`}
            label={`Segment scale · ${activeMetric.label}`}
            unit={activeMetric.unit}
            range={activeRange}
            onChange={(range) => {
              setSegmentRange(activeMetric.id, range);
            }}
          />

          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor="intersection-costs"
              className="text-xs font-normal text-muted-foreground"
            >
              Intersections
            </Label>
            <Switch
              id="intersection-costs"
              checked={showIntersections}
              onCheckedChange={setShowIntersections}
            />
          </div>

          {showIntersections &&
            (nodeScale ? (
              <RangeFields
                idPrefix={`node-range-${nodeScale.kind}`}
                label={nodeScale.label}
                unit={nodeScale.unit}
                range={nodeScale.range}
                onChange={(range) => {
                  setNodeRange(nodeScale.kind, range);
                }}
              />
            ) : (
              <p className="text-[10px] text-muted-foreground">
                {activeMetric.label} has no junction equivalent — a transition
                is charged at a point, with no length to divide by. Dots stay
                plain; click one for its numbers.
              </p>
            ))}

          {showIntersections && nodeScale && (
            <p className="text-[10px] text-muted-foreground">
              Dot size clamps at the scale: a dark outline means the value is
              above it, a grey one below.
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground">
              Scales are absolute, so colours compare across routes.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={resetRanges}
              data-testid="reset-metric-ranges"
            >
              <RotateCcw className="size-3" />
              Reset
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground">
            Selected route only. Click a segment or junction for its exact
            numbers.
          </p>
        </>
      )}
    </div>
  );
};
