import { ReactComponent as BusSvg } from '@/images/bus.svg';
import { ReactComponent as ScooterSvg } from '@/images/scooter.svg';
import { ReactComponent as CarSvg } from '@/images/car.svg';
import { ReactComponent as TruckSvg } from '@/images/truck.svg';
import { ReactComponent as BikeSvg } from '@/images/bike.svg';
import { ReactComponent as PedestrianSvg } from '@/images/pedestrian.svg';
import { ReactComponent as MotorbikeSvg } from '@/images/motorbike.svg';
import { ReactComponent as AmbulanceSvg } from '@/images/ambulance.svg';
import type { Profile } from '@/stores/common-store';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useSelectedTargets } from '@/hooks/use-selected-targets';
import { useInstancesStore, instanceIndex } from '@/stores/instances-store';
import { getTargetColor } from '@/utils/profile-colors';
import { getProfileLabel } from '@/utils/profiles';
import { targetKey, type TargetRef } from '@/utils/targets';

const iconMap = {
  truck: <TruckSvg className="size-7" />,
  car: <CarSvg className="size-7" />,
  bicycle: <BikeSvg className="size-7" />,
  pedestrian: <PedestrianSvg className="size-7" />,
  motor_scooter: <ScooterSvg className="size-7" />,
  bus: <BusSvg className="size-7" />,
  motorcycle: <MotorbikeSvg className="size-7" />,
  emergency: <AmbulanceSvg className="size-7" />,
};

const profiles: Profile[] = [
  'bicycle',
  'pedestrian',
  'car',
  'truck',
  'bus',
  'motor_scooter',
  'motorcycle',
  'emergency',
];

interface ProfilePickerProps {
  loading: boolean;
  onTargetsChange: (value: TargetRef[]) => void;
}

/**
 * One row of profiles per Valhalla instance. Picking `car` on two servers makes
 * two independent targets, which is what lets the same profile be compared
 * across builds.
 */
export const ProfilePicker = ({
  loading,
  onTargetsChange,
}: ProfilePickerProps) => {
  const selectedTargets = useSelectedTargets();
  const instances = useInstancesStore((state) => state.instances);

  const handleInstanceChange = useCallback(
    (instanceId: string, nextProfiles: Profile[]) => {
      const others = selectedTargets.filter(
        (target) => target.instanceId !== instanceId
      );
      const next = nextProfiles.map((profile) => ({ instanceId, profile }));

      // At least one target overall has to stay selected — clearing every
      // instance would leave nothing to route with.
      if (others.length === 0 && next.length === 0) return;

      // Rebuild in instance-list order so the URL and the panels stay stable.
      const merged = instances.flatMap((instance) =>
        instance.id === instanceId
          ? next
          : others.filter((target) => target.instanceId === instance.id)
      );
      onTargetsChange(merged);
    },
    [selectedTargets, instances, onTargetsChange]
  );

  return (
    <div className="flex flex-col gap-3">
      <TooltipProvider>
        {instances.map((instance) => {
          const index = instanceIndex(instances, instance.id);
          const selectedHere = selectedTargets
            .filter((target) => target.instanceId === instance.id)
            .map((target) => target.profile);

          return (
            <div key={instance.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold">{instance.label}</span>
                <span
                  className="text-muted-foreground truncate text-[10px]"
                  title={instance.url}
                >
                  {instance.url}
                </span>
              </div>

              <ToggleGroup
                type="multiple"
                variant="outline"
                size="lg"
                value={selectedHere}
                className="[&_button]:h-12 [&_button]:min-w-11 [&_button]:px-1"
                onValueChange={(value: string[]) => {
                  // Radix hands back the raw set; re-order it so the list keeps
                  // the picker's left-to-right order and stays stable in the URL.
                  handleInstanceChange(
                    instance.id,
                    profiles.filter((p) => value.includes(p))
                  );
                }}
              >
                {profiles.map((profile) => {
                  const isSelected = selectedHere.includes(profile);
                  const label = getProfileLabel(profile);
                  const target = { instanceId: instance.id, profile };

                  return (
                    <Tooltip key={targetKey(target)}>
                      <TooltipTrigger asChild>
                        <ToggleGroupItem
                          value={profile}
                          aria-label={`Select ${label} profile on ${instance.label}`}
                          data-testid={`profile-button-${targetKey(target)}`}
                          data-state={isSelected ? 'on' : 'off'}
                          className="relative flex-col"
                        >
                          {isSelected && loading ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            iconMap[profile as keyof typeof iconMap]
                          )}
                          {/* Colour key tying this target to its lines/polygons. */}
                          {isSelected && (
                            <span
                              aria-hidden
                              className="absolute inset-x-1 bottom-0.5 h-1 rounded-full"
                              style={{
                                backgroundColor: getTargetColor(index, profile),
                              }}
                            />
                          )}
                        </ToggleGroupItem>
                      </TooltipTrigger>
                      <TooltipContent>
                        {label} · {instance.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </ToggleGroup>
            </div>
          );
        })}
      </TooltipProvider>

      <p className="text-muted-foreground text-xs">
        {selectedTargets.length > 1
          ? `Comparing ${selectedTargets.length.toString()} targets — each is routed between the same waypoints.`
          : 'Select more profiles, on any server, to compare them side by side.'}
      </p>
    </div>
  );
};
