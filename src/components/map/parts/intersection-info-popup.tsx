import { Popup } from 'react-map-gl/maplibre';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface IntersectionInfo {
  lng: number;
  lat: number;
  cost: number;
  seconds: number;
  intoStreets: string;
  intoRoadClass: string | null;
  fromWayId: number | null;
  intoWayId: number | null;
  nodeType: string | null;
  trafficSignal: boolean;
}

interface IntersectionInfoPopupProps {
  info: IntersectionInfo;
  onClose: () => void;
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-mono">{value}</span>
  </div>
);

/**
 * What one junction costs. Kept apart from the segment popup because a
 * transition is a cost at a point — there is no length to divide it by, and
 * the per-kilometre metrics would be meaningless here.
 */
export function IntersectionInfoPopup({
  info,
  onClose,
}: IntersectionInfoPopupProps) {
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
      <div className="min-w-[210px] px-2 pb-1 text-xs">
        <div className="mb-1 flex items-start justify-between gap-2">
          <span className="font-bold">Intersection</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close intersection info"
          >
            <X className="size-3.5" />
          </Button>
        </div>
        <div className="space-y-0.5">
          <Row label="Transition cost" value={info.cost.toFixed(2)} />
          <Row label="Transition time" value={`${info.seconds.toFixed(3)} s`} />
          <div className="my-1 border-t" />
          <Row label="Into" value={info.intoStreets || 'Unnamed road'} />
          {info.intoRoadClass !== null && (
            <Row label="Road class" value={info.intoRoadClass} />
          )}
          {info.nodeType !== null && (
            <Row label="Node type" value={info.nodeType} />
          )}
          {info.trafficSignal && <Row label="Traffic signal" value="yes" />}
          <div className="my-1 border-t" />
          {/* Valhalla drops OSM node ids when it builds the graph, so there is
              no id to show. The two ways meeting here, plus the coordinate,
              pin the junction down in OSM instead. */}
          {info.fromWayId !== null && (
            <Row label="From way" value={String(info.fromWayId)} />
          )}
          {info.intoWayId !== null && (
            <Row label="Into way" value={String(info.intoWayId)} />
          )}
          <Row
            label="Location"
            value={`${info.lat.toFixed(6)}, ${info.lng.toFixed(6)}`}
          />
        </div>
        <a
          className="mt-1 block text-[10px] underline"
          href={`https://www.openstreetmap.org/#map=19/${info.lat.toFixed(6)}/${info.lng.toFixed(6)}`}
          target="_blank"
          rel="noreferrer"
        >
          Open junction on osm.org
        </a>
        {/* Cost and seconds diverge wildly here — a junction can cost 87 at a
            hundredth of a second — so the seconds are not a sanity check on
            the cost, they are a separate fact. */}
        <p className="mt-1 text-[10px] text-muted-foreground">
          Charged on entering the next edge.
        </p>
      </div>
    </Popup>
  );
}
