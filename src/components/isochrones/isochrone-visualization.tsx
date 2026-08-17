import { useIsochronesStore } from '@/stores/isochrones-store';
import { SelectSetting } from '@/components/ui/select-setting';
import { SliderSetting } from '@/components/ui/slider-setting';
import {
  ISOCHRONE_PALETTES,
  isPaletteId,
  DEFAULT_OPACITY,
} from '@/utils/isochrone-palettes';

const paletteOptions = ISOCHRONE_PALETTES.map((p) => ({
  key: p.id,
  value: p.id,
  text: p.label,
}));

/**
 * Palette and opacity apply to the whole isochrone layer, so they live above
 * the per-profile cards rather than inside one of them.
 */
export const IsochroneVisualization = ({
  multipleProfiles,
}: {
  multipleProfiles: boolean;
}) => {
  const colorPalette = useIsochronesStore((state) => state.colorPalette);
  const opacity = useIsochronesStore((state) => state.opacity);
  const updateVisualization = useIsochronesStore(
    (state) => state.updateVisualization
  );

  return (
    <div className="flex flex-col gap-1">
      {multipleProfiles ? (
        <p className="text-muted-foreground text-xs">
          Each profile is shaded in its own colour so the contours can be told
          apart; the palette below applies when a single profile is selected.
        </p>
      ) : (
        <SelectSetting
          id="colorPalette"
          label="Color Palette"
          description="Choose a color palette for the isochrone polygons. Viridis is a colorblind-friendly option."
          value={colorPalette}
          options={paletteOptions}
          onValueChange={(value) => {
            if (isPaletteId(value)) {
              updateVisualization({ colorPalette: value });
            }
          }}
        />
      )}
      <SliderSetting
        id="opacity"
        label="Opacity"
        description="Controls the transparency of the isochrone fill. Lower values make the map underneath more visible."
        min={0}
        max={1}
        step={0.05}
        value={opacity}
        onValueChange={(values) => {
          const value = values[0] ?? DEFAULT_OPACITY;
          updateVisualization({ opacity: value });
        }}
        onInputChange={(values) => {
          let value = values[0] ?? DEFAULT_OPACITY;
          value = isNaN(value)
            ? DEFAULT_OPACITY
            : Math.min(1, Math.max(0, value));
          updateVisualization({ opacity: value });
        }}
      />
    </div>
  );
};
