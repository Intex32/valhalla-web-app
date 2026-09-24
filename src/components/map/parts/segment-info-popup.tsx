import { Popup } from 'react-map-gl/maplibre';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SEGMENT_METRICS } from '@/utils/segment-metrics';

export interface SegmentInfo {
  lng: number;
  lat: number;
  streets: string;
  instruction: string;
  /** Kilometres. */
  length: number;
  /** Seconds. */
  time: number;
  cost: number;
  /** Per-edge only; null in the coarser maneuver view. */
  edgeId: number | null;
  wayId: number | null;
  roadClass: string | null;
  speed: number | null;
  transitionTime: number | null;
  transitionCost: number | null;
}

interface SegmentInfoPopupProps {
  info: SegmentInfo;
  onClose: () => void;
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-mono">{value}</span>
  </div>
);

/** Exact numbers for one clicked segment — raw first, then every metric. */
export function SegmentInfoPopup({ info, onClose }: SegmentInfoPopupProps) {
  // The popup shows all metrics at once: when a segment looks wrong, the
  // interesting question is usually how the metrics disagree.
  const segment = {
    index: 0,
    streets: [],
    instruction: info.instruction,
    length: info.length,
    time: info.time,
    cost: info.cost,
    coordinates: [],
  };

  return (
    <Popup
      longitude={info.lng}
      latitude={info.lat}
      anchor="bottom"
      closeButton={false}
      closeOnClick={false}
      maxWidth="none"
      onClose={onClose}
    >
      <div className="min-w-[220px] px-2 pb-1 text-xs">
        <div className="mb-1 flex items-start justify-between gap-2">
          <span className="font-bold">{info.streets || 'Unnamed road'}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close segment info"
          >
            <X className="size-3.5" />
          </Button>
        </div>
        <div className="space-y-0.5">
          <Row label="Length" value={`${info.length.toFixed(3)} km`} />
          <Row label="Time" value={`${info.time.toFixed(1)} s`} />
          <Row label="Cost" value={info.cost.toFixed(2)} />
          {info.roadClass !== null && (
            <Row label="Road class" value={info.roadClass} />
          )}
          {info.speed !== null && (
            <Row label="Edge speed" value={`${info.speed.toFixed(0)} km/h`} />
          )}
          {info.transitionCost !== null && info.transitionCost > 0 && (
            <Row
              label="Entry transition"
              value={`${info.transitionCost.toFixed(2)} (own node)`}
            />
          )}
          <div className="my-1 border-t" />
          {SEGMENT_METRICS.map((metric) => (
            <Row
              key={metric.id}
              label={metric.label}
              value={`${metric.format(metric.value(segment))} ${metric.unit}`}
            />
          ))}
          {info.edgeId !== null && (
            <>
              <div className="my-1 border-t" />
              {/* The transition into this edge has been subtracted out and
                  drawn as its own junction node, so these numbers are the
                  edge's own. */}
              <p className="text-[10px] text-muted-foreground">
                Edge cost only; the entry transition is its own node.
              </p>
              <Row label="Edge id" value={String(info.edgeId)} />
              {info.wayId !== null && (
                <Row label="OSM way" value={String(info.wayId)} />
              )}
            </>
          )}
        </div>
      </div>
    </Popup>
  );
}
