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
import { useSelectedProfiles } from '@/hooks/use-selected-profiles';
import { getProfileColor } from '@/utils/profile-colors';
import { getProfileLabel } from '@/utils/profiles';

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
  onProfileChange: (value: Profile[]) => void;
}

export const ProfilePicker = ({
  loading,
  onProfileChange,
}: ProfilePickerProps) => {
  const selectedProfiles = useSelectedProfiles();

  const handleUpdateProfiles = useCallback(
    (next: Profile[]) => {
      // At least one profile has to stay selected — deselecting the last one
      // would leave nothing to route with.
      if (next.length === 0) return;

      // Each profile keeps its own costing options, so changing the selection
      // never has to discard anything the user has tuned.
      onProfileChange(next);
    },
    [onProfileChange]
  );

  return (
    <div className="flex flex-col gap-2">
      <TooltipProvider>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="lg"
          value={selectedProfiles}
          className="[&_button]:h-12 [&_button]:min-w-11 [&_button]:px-1"
          onValueChange={(value: string[]) => {
            // Radix hands back the raw set; re-order it so the list keeps the
            // picker's left-to-right order and stays stable in the URL.
            handleUpdateProfiles(profiles.filter((p) => value.includes(p)));
          }}
        >
          {profiles.map((profile) => {
            const isSelected = selectedProfiles.includes(profile);
            const label = getProfileLabel(profile);

            return (
              <Tooltip key={profile}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value={profile}
                    aria-label={`Select ${label} profile`}
                    data-testid={`profile-button-${profile}`}
                    data-state={isSelected ? 'on' : 'off'}
                    className="relative flex-col"
                  >
                    {isSelected && loading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      iconMap[profile as keyof typeof iconMap]
                    )}
                    {/* Colour key tying this profile to its lines/polygons. */}
                    {isSelected && (
                      <span
                        aria-hidden
                        className="absolute inset-x-1 bottom-0.5 h-1 rounded-full"
                        style={{ backgroundColor: getProfileColor(profile) }}
                      />
                    )}
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </ToggleGroup>
      </TooltipProvider>
      <p className="text-muted-foreground text-xs">
        {selectedProfiles.length > 1
          ? `Comparing ${selectedProfiles.length.toString()} profiles — each is routed between the same waypoints.`
          : 'Select more than one profile to compare them side by side.'}
      </p>
    </div>
  );
};
