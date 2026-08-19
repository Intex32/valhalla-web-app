import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import { useIsochronesStore } from '@/stores/isochrones-store';
import { useInstancesStore, instanceIndex } from '@/stores/instances-store';
import type { Feature, FeatureCollection } from 'geojson';
import {
  ISOCHRONE_PALETTES,
  getPaletteColor,
} from '@/utils/isochrone-palettes';
import { getTargetColor, getTargetContourColor } from '@/utils/profile-colors';
import { targetKey } from '@/utils/targets';

export function IsochronePolygons() {
  const isoResults = useIsochronesStore((state) => state.results);
  const isoSuccessful = useIsochronesStore((state) => state.successful);
  const colorPalette = useIsochronesStore((state) => state.colorPalette);
  const opacity = useIsochronesStore((state) => state.opacity);
  const instances = useInstancesStore((state) => state.instances);

  const data = useMemo(() => {
    if (!isoSuccessful) return null;

    // Drop targets whose instance has since been removed — they would keep
    // drawing and be recoloured as instance 0.
    const known = new Set(instances.map((instance) => instance.id));
    const visible = isoResults.byTarget.filter(
      ({ target }) =>
        known.has(target.instanceId) &&
        isoResults.show[targetKey(target)] !== false
    );
    if (visible.length === 0) return null;

    const palette =
      ISOCHRONE_PALETTES.find((p) => p.id === colorPalette) ??
      ISOCHRONE_PALETTES[0];
    const paletteColors = palette?.colors ?? null;

    // Comparing targets means hue has to encode the target, so the palette
    // (and Valhalla's own contour colours) give way to a per-target ramp.
    // Keyed off how many targets were *routed*, not how many are currently
    // visible, so hiding one doesn't recolour the ones left on the map — they
    // have to keep matching the colour key in their cards.
    const colorByTarget =
      isoResults.byTarget.filter((entry) => known.has(entry.target.instanceId))
        .length > 1;

    const features: Feature[] = [];

    for (const { target, data: response } of visible) {
      const index = instanceIndex(instances, target.instanceId);
      const polygons = response.features.filter((f) =>
        ['Polygon', 'MultiPolygon'].includes(f.geometry.type)
      );

      const actualMax = polygons.reduce(
        (m, f) => Math.max(m, f.properties?.contour ?? 0),
        0
      );

      // Largest contour first so the smaller ones stay visible on top of it.
      for (const feature of [...polygons].reverse()) {
        const contour = feature.properties?.contour ?? 0;
        const t = actualMax > 0 ? contour / actualMax : 1;

        // `fill` may already be set by Valhalla — only override it when the
        // target ramp or a user-selected palette should win.
        const fill = colorByTarget
          ? getTargetContourColor(index, target.profile, t)
          : paletteColors
            ? getPaletteColor(paletteColors, t)
            : feature.properties?.fill;

        features.push({
          ...feature,
          properties: {
            ...feature.properties,
            instanceId: target.instanceId,
            profile: target.profile,
            fill,
            outline: colorByTarget
              ? getTargetColor(index, target.profile)
              : '#fff',
          },
        });
      }
    }

    return {
      type: 'FeatureCollection',
      features,
    } as FeatureCollection;
  }, [isoResults, isoSuccessful, colorPalette, instances]);

  if (!data) return null;

  return (
    <Source id="isochrones" type="geojson" data={data}>
      <Layer
        id="isochrones-fill"
        type="fill"
        paint={{
          'fill-color': ['get', 'fill'],
          'fill-opacity': opacity,
        }}
      />
      <Layer
        id="isochrones-outline"
        type="line"
        paint={{
          'line-color': ['get', 'outline'],
          'line-width': 1,
          'line-opacity': 1,
        }}
      />
    </Source>
  );
}
