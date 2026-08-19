import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import { useDirectionsStore, routeKey } from '@/stores/directions-store';
import { useInstancesStore, instanceIndex } from '@/stores/instances-store';
import { getTargetRouteColor } from '@/utils/profile-colors';
import { sameTarget, type TargetRef } from '@/utils/targets';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { ParsedDirectionsGeometry } from '@/components/types';

export function RouteLines() {
  const directionResults = useDirectionsStore((state) => state.results);
  const directionsSuccessful = useDirectionsStore((state) => state.successful);
  const activeRoute = useDirectionsStore((state) => state.activeRoute);
  const instances = useInstancesStore((state) => state.instances);

  const data = useMemo(() => {
    if (!directionsSuccessful) return null;
    if (directionResults.byTarget.length === 0) return null;

    const showRoutes = directionResults.show || {};
    const features: Feature<LineString>[] = [];

    const addRoute = (
      target: TargetRef,
      index: number,
      route: ParsedDirectionsGeometry
    ) => {
      if (showRoutes[routeKey(target, index)] === false) return;

      const isActive =
        activeRoute !== null &&
        sameTarget(activeRoute, target) &&
        activeRoute.index === index;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: route.decodedGeometry.map((c) => [c[1] ?? 0, c[0] ?? 0]),
        },
        properties: {
          color: getTargetRouteColor(
            instanceIndex(instances, target.instanceId),
            target.profile,
            index
          ),
          type: index === 0 ? 'main' : 'alternate',
          // Both halves of the identity travel with the feature — the click
          // handler in map/index.tsx reads them back to set the active route.
          instanceId: target.instanceId,
          profile: target.profile,
          routeIndex: index,
          isActive,
          summary: route.trip.summary,
        },
      });
    };

    // An instance can be removed while its results are still in the store.
    // Without this its lines would keep drawing, uncontrollable, and take
    // instance 0's colour (instanceIndex clamps a missing id to 0).
    const known = new Set(instances.map((instance) => instance.id));

    for (const { target, data: response } of directionResults.byTarget) {
      if (!known.has(target.instanceId)) continue;
      response.alternates?.forEach((alternate, i) => {
        if (alternate) {
          addRoute(target, i + 1, alternate as ParsedDirectionsGeometry);
        }
      });
      addRoute(target, 0, response);
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
  }, [directionResults, directionsSuccessful, activeRoute, instances]);

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
