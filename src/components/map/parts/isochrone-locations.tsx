import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import { useIsochronesStore } from '@/stores/isochrones-store';
import type { Feature, FeatureCollection } from 'geojson';

export function IsochroneLocations() {
  const isoResults = useIsochronesStore((state) => state.results);
  const isoSuccessful = useIsochronesStore((state) => state.successful);

  const data = useMemo(() => {
    if (!isoSuccessful) return null;

    // Every profile snaps to the same centre, so one profile's locations are
    // enough — drawing them all would just stack identical circles.
    const first = isoResults.byProfile.find(
      ({ profile }) => isoResults.show[profile] !== false
    );
    if (!first) return null;

    const features: Feature[] = [];

    for (const feature of first.data.features) {
      if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
        if (feature.properties?.type !== 'input') {
          features.push(feature);
        }
      }
    }

    return {
      type: 'FeatureCollection',
      features,
    } as FeatureCollection;
  }, [isoResults, isoSuccessful]);

  if (!data) return null;

  return (
    <Source id="iso-locations" type="geojson" data={data}>
      <Layer
        id="iso-locations-circle"
        type="circle"
        paint={{
          'circle-radius': 6,
          'circle-color': '#fff',
          'circle-stroke-color': '#000',
          'circle-stroke-width': 2,
        }}
      />
    </Source>
  );
}
