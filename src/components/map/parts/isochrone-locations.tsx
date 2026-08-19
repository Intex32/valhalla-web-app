import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import { useIsochronesStore } from '@/stores/isochrones-store';
import { useInstancesStore } from '@/stores/instances-store';
import { targetKey } from '@/utils/targets';
import type { Feature, FeatureCollection } from 'geojson';

export function IsochroneLocations() {
  const isoResults = useIsochronesStore((state) => state.results);
  const isoSuccessful = useIsochronesStore((state) => state.successful);
  const instances = useInstancesStore((state) => state.instances);

  const data = useMemo(() => {
    if (!isoSuccessful) return null;

    // Within one instance every profile snaps to the same centre. Across
    // instances the tilesets can differ, so draw one marker per instance.
    // Targets whose instance has since been removed are dropped, matching
    // RouteLines and IsochronePolygons.
    const known = new Set(instances.map((instance) => instance.id));
    const seenInstances = new Set<string>();
    const perInstance = isoResults.byTarget.filter(({ target }) => {
      if (!known.has(target.instanceId)) return false;
      if (isoResults.show[targetKey(target)] === false) return false;
      if (seenInstances.has(target.instanceId)) return false;
      seenInstances.add(target.instanceId);
      return true;
    });
    if (perInstance.length === 0) return null;

    const features: Feature[] = [];

    for (const { data: response } of perInstance) {
      for (const feature of response.features) {
        if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
          if (feature.properties?.type !== 'input') {
            features.push(feature);
          }
        }
      }
    }

    return {
      type: 'FeatureCollection',
      features,
    } as FeatureCollection;
  }, [isoResults, isoSuccessful, instances]);

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
