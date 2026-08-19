import { useCallback, useEffect, useRef } from 'react';

import { Waypoints } from './waypoints/waypoint-list';

import { SettingsFooter } from '@/components/settings-footer';
import { QuickSettings } from '@/components/quick-settings';

import type { ParsedDirectionsGeometry } from '@/components/types';
import { Button } from '@/components/ui/button';
import { MapPinPlus, MapPinXInside } from 'lucide-react';
import { RouteCard } from './route-card';
import { parseUrlParams } from '@/utils/parse-url-params';
import { isValidCoordinates } from '@/utils/geom';
import { useNavigate } from '@tanstack/react-router';
import { useDirectionsStore } from '@/stores/directions-store';
import { useInstancesStore, instanceIndex } from '@/stores/instances-store';
import { getTargetColor } from '@/utils/profile-colors';
import { getProfileLabel } from '@/utils/profiles';
import { sameTarget, targetKey, type TargetRef } from '@/utils/targets';
import { InstanceResultsGroup } from '@/components/instance-results-group';
import { ExportWaypointsButton } from './export-waypoints-button';
import {
  useDirectionsQuery,
  useSetWaypointFromCoords,
} from '@/hooks/use-directions-queries';
import { useOptimizedRouteQuery } from '@/hooks/use-optimized-route-query';
import { Sparkles } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const DirectionsControl = () => {
  const waypoints = useDirectionsStore((state) => state.waypoints);
  const results = useDirectionsStore((state) => state.results);
  const addEmptyWaypointToEnd = useDirectionsStore(
    (state) => state.addEmptyWaypointToEnd
  );
  const clearWaypoints = useDirectionsStore((state) => state.clearWaypoints);
  const clearRoutes = useDirectionsStore((state) => state.clearRoutes);
  const initialUrlParams = useRef(parseUrlParams());
  const urlParamsProcessed = useRef(false);
  const navigate = useNavigate({ from: '/$activeTab' });
  const { refetch: refetchDirections } = useDirectionsQuery();
  const { setWaypointFromCoords } = useSetWaypointFromCoords();
  const { optimizeRoute, isPending: isOptimizing } = useOptimizedRouteQuery();
  const isOptimized = useDirectionsStore((state) => state.isOptimized);
  const activeRoute = useDirectionsStore((state) => state.activeRoute);
  const setActiveRoute = useDirectionsStore((state) => state.setActiveRoute);

  const instances = useInstancesStore((state) => state.instances);

  const isActiveRoute = (target: TargetRef, index: number) =>
    activeRoute !== null &&
    sameTarget(activeRoute, target) &&
    activeRoute.index === index;

  // Group by instance in list order, so the panel reads server by server.
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
    if (urlParamsProcessed.current) return;

    const alreadyHydrated = useDirectionsStore
      .getState()
      .waypoints.some((wp) => wp.geocodeResults.some((r) => r.selected));
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

        const index = i / 2;
        setWaypointFromCoords(lng, lat, index, { isPermalink: true });
      }
      refetchDirections();
    }

    urlParamsProcessed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const wps: number[] = [];

    for (const wp of waypoints) {
      for (const result of wp.geocodeResults) {
        if (result.selected && result.sourcelnglat) {
          wps.push(result.sourcelnglat[0], result.sourcelnglat[1]);
        }
      }
    }

    navigate({
      search: (prev) => ({
        ...prev,
        wps: wps.length > 0 ? wps.join(',') : undefined,
      }),
      replace: true,
    });
  }, [waypoints, navigate]);

  const handleAddWaypoint = useCallback(() => {
    addEmptyWaypointToEnd();
  }, [addEmptyWaypointToEnd]);

  const handleRemoveWaypoints = useCallback(() => {
    clearWaypoints();
    clearRoutes();
  }, [clearWaypoints, clearRoutes]);

  const activeWaypointsCount = waypoints.filter((wp) =>
    wp.geocodeResults.some((r) => r.selected)
  ).length;

  return (
    <>
      <div className="flex flex-col gap-3">
        <Waypoints />
        <div className="flex justify-between gap-4">
          <Button
            variant="outline"
            onClick={handleAddWaypoint}
            data-testid="add-waypoint-button"
            className="w-full shrink"
          >
            <MapPinPlus className="size-5" />
            Add Waypoint
          </Button>
          <Button
            variant="destructive-outline"
            onClick={handleRemoveWaypoints}
            data-testid="reset-waypoints-button"
            className="w-full shrink"
            disabled={
              waypoints.length < 3 && waypoints.every((wp) => !wp.userInput)
            }
          >
            <MapPinXInside className="size-5" />
            Reset Waypoints
          </Button>
        </div>
        <ExportWaypointsButton />
        <Tooltip open={activeWaypointsCount >= 4 ? false : undefined}>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="outline"
                onClick={() => optimizeRoute()}
                disabled={
                  activeWaypointsCount < 4 || isOptimizing || isOptimized
                }
                className="w-full"
              >
                <Sparkles className="size-4" />
                Optimize Route
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>You should have at least 4 waypoints to optimize the route</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <QuickSettings />
      <SettingsFooter />
      {instanceGroups.length > 0 && (
        <div>
          <h3 className="font-bold mb-2">Directions</h3>
          <div className="flex flex-col gap-4">
            {instanceGroups.map(({ instance, entries, failures }) => (
              <InstanceResultsGroup
                key={instance.id}
                instanceId={instance.id}
                failures={failures}
              >
                {entries.map(({ target, data }) => (
                  <div key={targetKey(target)} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-3 shrink-0 rounded-full"
                        style={{
                          backgroundColor: getTargetColor(
                            instanceIndex(instances, target.instanceId),
                            target.profile
                          ),
                        }}
                      />
                      <span className="text-sm font-semibold">
                        {getProfileLabel(target.profile)}
                      </span>
                    </div>
                    <RouteCard
                      data={data}
                      target={target}
                      index={0}
                      isActive={isActiveRoute(target, 0)}
                      onSelect={() => setActiveRoute({ ...target, index: 0 })}
                    />
                    {data.alternates?.map((alternate, index) => (
                      <RouteCard
                        data={alternate as ParsedDirectionsGeometry}
                        key={`${targetKey(target)}__${(index + 1).toString()}`}
                        target={target}
                        index={index + 1}
                        isActive={isActiveRoute(target, index + 1)}
                        onSelect={() =>
                          setActiveRoute({ ...target, index: index + 1 })
                        }
                      />
                    ))}
                  </div>
                ))}
              </InstanceResultsGroup>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
