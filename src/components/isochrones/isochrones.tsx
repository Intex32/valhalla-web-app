import { useEffect, useRef } from 'react';
import { Waypoints } from './waypoints';
import { SettingsFooter } from '@/components/settings-footer';
import { QuickSettings } from '@/components/quick-settings';
import { useIsochronesStore } from '@/stores/isochrones-store';
import { IsochroneCard } from './isochrone-card';
import { IsochroneVisualization } from './isochrone-visualization';
import { InstanceResultsGroup } from '@/components/instance-results-group';
import { useInstancesStore } from '@/stores/instances-store';
import { targetKey } from '@/utils/targets';
import { parseUrlParams } from '@/utils/parse-url-params';
import { isValidCoordinates } from '@/utils/geom';
import { useNavigate } from '@tanstack/react-router';
import { useMap } from 'react-map-gl/maplibre';
import {
  useIsochronesQuery,
  useReverseGeocodeIsochrones,
} from '@/hooks/use-isochrones-queries';

export const IsochronesControl = () => {
  const { mainMap } = useMap();
  const results = useIsochronesStore((state) => state.results);
  const geocodeResults = useIsochronesStore((state) => state.geocodeResults);
  const initialUrlParams = useRef(parseUrlParams());
  const urlParamsProcessed = useRef(false);
  const navigate = useNavigate({ from: '/$activeTab' });
  const { refetch: refetchIsochrones } = useIsochronesQuery();
  const { reverseGeocode } = useReverseGeocodeIsochrones();
  const instances = useInstancesStore((state) => state.instances);

  // Grouped by instance in list order, so the panel reads server by server.
  const instanceGroups = instances
    .map((instance) => ({
      instance,
      entries: results.byTarget.filter(
        (entry) => entry.target.instanceId === instance.id
      ),
      failures: results.failures.filter(
        (failure) => failure.target.instanceId === instance.id
      ),
    }))
    .filter((group) => group.entries.length > 0 || group.failures.length > 0);

  useEffect(() => {
    if (urlParamsProcessed.current || !mainMap) return;

    const alreadyHydrated = useIsochronesStore
      .getState()
      .geocodeResults.some((r) => r.selected);
    if (alreadyHydrated) {
      urlParamsProcessed.current = true;
      return;
    }

    const wpsParam = initialUrlParams.current.wps;

    if (wpsParam) {
      const coordinates = wpsParam.split(',').map(Number);

      for (let i = 0; i < coordinates.length; i += 2) {
        const lng = coordinates[i]!;
        const lat = coordinates[i + 1]!;

        if (!isValidCoordinates(lat, lng) || isNaN(lng) || isNaN(lat)) continue;

        reverseGeocode(lng, lat).then(() => {
          refetchIsochrones();
        });
      }

      mainMap.flyTo({
        center: [coordinates[0]!, coordinates[1]!],
        zoom: 12,
      });
    }

    urlParamsProcessed.current = true;
  }, [mainMap, reverseGeocode, refetchIsochrones]);

  // Sync isochrone center to URL
  useEffect(() => {
    let center: string | undefined;

    for (const result of geocodeResults) {
      if (result.selected && result.sourcelnglat) {
        center = result.sourcelnglat.join(',');
      }
    }

    navigate({
      search: (prev) => ({ ...prev, wps: center || undefined }),
      replace: true,
    });
  }, [geocodeResults, navigate]);

  return (
    <>
      <Waypoints />
      <QuickSettings showLanguage={false} />
      <SettingsFooter />
      {instanceGroups.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-bold">Isochrones</h3>
          <IsochroneVisualization
            multipleProfiles={results.byTarget.length > 1}
          />
          {instanceGroups.map(({ instance, entries, failures }) => (
            <InstanceResultsGroup
              key={instance.id}
              instanceId={instance.id}
              failures={failures}
            >
              {entries.map(({ target, data }) => (
                <IsochroneCard
                  key={targetKey(target)}
                  data={data}
                  target={target}
                  showOnMap={results.show[targetKey(target)] ?? true}
                  showProfileLabel={results.byTarget.length > 1}
                />
              ))}
            </InstanceResultsGroup>
          ))}
        </div>
      )}
    </>
  );
};
