import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import { useIsochronesStore } from '@/stores/isochrones-store';
import type { Feature, FeatureCollection } from 'geojson';
import {
  ISOCHRONE_PALETTES,
  getPaletteColor,
} from '@/utils/isochrone-palettes';
import {
  getProfileColor,
  getProfileContourColor,
} from '@/utils/profile-colors';

export function IsochronePolygons() {
  const isoResults = useIsochronesStore((state) => state.results);
  const isoSuccessful = useIsochronesStore((state) => state.successful);
  const colorPalette = useIsochronesStore((state) => state.colorPalette);
  const opacity = useIsochronesStore((state) => state.opacity);

  const data = useMemo(() => {
    if (!isoSuccessful) return null;

    const visible = isoResults.byProfile.filter(
      ({ profile }) => isoResults.show[profile] !== false
    );
    if (visible.length === 0) return null;

    const palette =
      ISOCHRONE_PALETTES.find((p) => p.id === colorPalette) ??
      ISOCHRONE_PALETTES[0];
    const paletteColors = palette?.colors ?? null;

    // Comparing profiles means hue has to encode the profile, so the palette
    // (and Valhalla's own contour colours) give way to a per-profile ramp.
    // Keyed off how many profiles were *routed*, not how many are currently
    // visible, so hiding one doesn't recolour the ones left on the map — they
    // have to keep matching the colour key in their cards.
    const colorByProfile = isoResults.byProfile.length > 1;

    const features: Feature[] = [];

    for (const { profile, data: response } of visible) {
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
        // profile ramp or a user-selected palette should win.
        const fill = colorByProfile
          ? getProfileContourColor(profile, t)
          : paletteColors
            ? getPaletteColor(paletteColors, t)
            : feature.properties?.fill;

        features.push({
          ...feature,
          properties: {
            ...feature.properties,
            profile,
            fill,
            outline: colorByProfile ? getProfileColor(profile) : '#fff',
          },
        });
      }
    }

    return {
      type: 'FeatureCollection',
      features,
    } as FeatureCollection;
  }, [isoResults, isoSuccessful, colorPalette]);

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
