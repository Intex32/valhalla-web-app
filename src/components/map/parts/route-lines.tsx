import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import { useDirectionsStore, routeKey } from '@/stores/directions-store';
import { getRouteColor } from '@/utils/profile-colors';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { ParsedDirectionsGeometry } from '@/components/types';
import type { Profile } from '@/stores/common-store';

export function RouteLines() {
  const directionResults = useDirectionsStore((state) => state.results);
  const directionsSuccessful = useDirectionsStore((state) => state.successful);
  const activeRoute = useDirectionsStore((state) => state.activeRoute);

  const data = useMemo(() => {
    if (!directionsSuccessful) return null;
    if (directionResults.byProfile.length === 0) return null;

    const showRoutes = directionResults.show || {};
    const features: Feature<LineString>[] = [];

    const addRoute = (
      profile: Profile,
      index: number,
      route: ParsedDirectionsGeometry
    ) => {
      if (showRoutes[routeKey(profile, index)] === false) return;

      const isActive =
        activeRoute?.profile === profile && activeRoute.index === index;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: route.decodedGeometry.map((c) => [c[1] ?? 0, c[0] ?? 0]),
        },
        properties: {
          color: getRouteColor(profile, index),
          type: index === 0 ? 'main' : 'alternate',
          profile,
          routeIndex: index,
          isActive,
          summary: route.trip.summary,
        },
      });
    };

    for (const { profile, data: response } of directionResults.byProfile) {
      response.alternates?.forEach((alternate, i) => {
        if (alternate) {
          addRoute(profile, i + 1, alternate as ParsedDirectionsGeometry);
        }
      });
      addRoute(profile, 0, response);
    }

    // Sort so the active route renders last (on top).
    features.sort(
      (a, b) =>
        Number(Boolean(a.properties?.isActive)) -
        Number(Boolean(b.properties?.isActive))
    );

    return {
      type: 'FeatureCollection',
      features,
    } as FeatureCollection;
  }, [directionResults, directionsSuccessful, activeRoute]);

  if (!data) return null;

  return (
    <Source id="routes" type="geojson" data={data}>
      <Layer
        id="routes-outline"
        type="line"
        paint={{
          'line-color': '#FFF',
          'line-width': 9,
          'line-opacity': 1,
        }}
      />
      <Layer
        id="routes-line"
        type="line"
        paint={{
          'line-color': ['get', 'color'],
          'line-width': ['case', ['get', 'isActive'], 6, 4],
          'line-opacity': ['case', ['get', 'isActive'], 1, 0.6],
        }}
      />
      {/* Transparent wide line on top — used purely as a hit target so hover
          and click trigger when the cursor is near the route. ~5px of extra
          padding on each side of the visible stroke. */}
      <Layer
        id="routes-hit-target"
        type="line"
        paint={{
          'line-color': '#000',
          'line-width': 15,
          'line-opacity': 0,
        }}
      />
    </Source>
  );
}
