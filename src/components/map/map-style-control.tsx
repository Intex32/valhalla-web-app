import { useState, useEffect, useMemo, memo } from 'react';
import { LayersIcon } from 'lucide-react';
import Map, { useMap } from 'react-map-gl/maplibre';
import type maplibregl from 'maplibre-gl';
import { ControlButton, CustomControl } from './custom-control';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { CustomStylesDialog } from './custom-styles-dialog';
import { EditStylesDialog } from './edit-styles-dialog';
import { MAP_STYLES, MAP_STYLE_STORAGE_KEY } from './constants';
import type { MapStyleSource, MapStyleType } from './types';
import { getCustomStyleLabel, getInitialMapStyle } from './utils';

interface MapStyleControlProps {
  /** The custom slot: a style URL, an inlined spec, or nothing loaded yet. */
  customStyleData: MapStyleSource | null;
  onStyleChange?: (style: MapStyleType) => void;
  onCustomStyleLoaded?: (styleData: maplibregl.StyleSpecification) => void;
  onCustomStyleUrlLoaded?: (url: string, name?: string) => void;
}

interface MapStyleOptionProps {
  id: MapStyleType;
  label: string;
  style: MapStyleSource;
  isSelected: boolean;
  onSelect: (id: MapStyleType) => void;
  mapCenter: { lng: number; lat: number } | undefined;
  zoom: number | undefined;
}

const MapStyleOption = memo(
  ({
    id,
    label,
    style,
    isSelected,
    onSelect,
    mapCenter,
    zoom,
  }: MapStyleOptionProps) => {
    // Memoize the map style to prevent unnecessary re-renders
    const memoizedMapStyle = useMemo(
      () => style as unknown as maplibregl.StyleSpecification,
      [style]
    );

    return (
      <div>
        <div
          onClick={() => onSelect(id)}
          className={`cursor-pointer overflow-hidden rounded border-3 transition-colors ${
            isSelected ? 'border-primary' : 'border-transparent'
          }`}
        >
          <Map
            id={`${id}-map`}
            onMove={() => {}}
            longitude={mapCenter?.lng}
            latitude={mapCenter?.lat}
            zoom={zoom}
            attributionControl={false}
            style={{ width: '226px', height: '64px', display: 'block' }}
            mapStyle={memoizedMapStyle}
            boxZoom={false}
            doubleClickZoom={false}
            dragPan={false}
            dragRotate={false}
            interactive={false}
          />
        </div>
        <div
          className={`mt-1.5 text-center text-[13px] ${
            isSelected
              ? 'font-bold text-primary'
              : 'font-normal text-muted-foreground'
          }`}
        >
          {label}
        </div>
      </div>
    );
  }
);

MapStyleOption.displayName = 'MapStyleOption';

export const MapStyleControl = ({
  customStyleData,
  onStyleChange,
  onCustomStyleLoaded,
  onCustomStyleUrlLoaded,
}: MapStyleControlProps) => {
  const [selectedStyle, setSelectedStyle] =
    useState<MapStyleType>(getInitialMapStyle);

  const { current: map } = useMap();
  const mapCenter = map?.getCenter();
  const zoom = map?.getZoom();

  // Save to localStorage whenever selectedStyle changes
  useEffect(() => {
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, selectedStyle);
    onStyleChange?.(selectedStyle);
  }, [selectedStyle, onStyleChange]);

  // Memoize the map options to prevent re-creating them on every render
  const mapOptions = useMemo(() => {
    const options: Array<{
      id: MapStyleType;
      label: string;
      style: MapStyleSource;
      isSelected: boolean;
    }> = MAP_STYLES.map((mapStyle) => ({
      id: mapStyle.id,
      label: mapStyle.label,
      style: mapStyle.style,
      isSelected: selectedStyle === mapStyle.id,
    }));

    if (customStyleData) {
      options.push({
        id: 'custom',
        label: getCustomStyleLabel(customStyleData) ?? 'Custom',
        style: customStyleData,
        isSelected: selectedStyle === 'custom',
      });
    }

    return options;
  }, [selectedStyle, customStyleData]);

  const customStyleUrl =
    typeof customStyleData === 'string' ? customStyleData : null;

  return (
    <CustomControl position="topRight">
      <Popover>
        <PopoverTrigger asChild>
          <ControlButton title="Map Styles" icon={<LayersIcon size={17} />} />
        </PopoverTrigger>
        {/* The list outgrows a short viewport once a few styles are in it, so
            it scrolls within whatever room Radix measured below the button. */}
        <PopoverContent className="mt-1 mr-2 max-h-[calc(var(--radix-popover-content-available-height)-0.5rem)] w-[266px] overflow-y-auto rounded-md animate-in fade-in-0 zoom-in-95">
          <div className="space-y-2">
            <div className="flex flex-col gap-2.5">
              {mapOptions.map((mapOption) => (
                <MapStyleOption
                  key={mapOption.id}
                  id={mapOption.id}
                  label={mapOption.label}
                  style={mapOption.style}
                  isSelected={mapOption.isSelected}
                  onSelect={setSelectedStyle}
                  mapCenter={mapCenter}
                  zoom={zoom}
                />
              ))}
              <CustomStylesDialog
                currentStyleUrl={customStyleUrl}
                onStyleLoaded={(styleData) => {
                  setSelectedStyle('custom');
                  onCustomStyleLoaded?.(styleData);
                }}
                onStyleUrlLoaded={(url, name) => {
                  setSelectedStyle('custom');
                  onCustomStyleUrlLoaded?.(url, name);
                }}
              />
              {/* A URL-backed custom style has no local JSON to edit — its
                  source lives on the style server. */}
              {customStyleData &&
                typeof customStyleData !== 'string' &&
                selectedStyle === 'custom' && (
                  <EditStylesDialog
                    styleData={customStyleData}
                    onStyleSaved={(styleData) => {
                      onCustomStyleLoaded?.(styleData);
                    }}
                  />
                )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </CustomControl>
  );
};
