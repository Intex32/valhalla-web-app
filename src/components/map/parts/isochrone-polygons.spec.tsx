import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { IsochronePolygons } from './isochrone-polygons';
import {
  getProfileColor,
  getProfileContourColor,
} from '@/utils/profile-colors';
import {
  ISOCHRONE_PALETTES,
  getPaletteColor,
} from '@/utils/isochrone-palettes';

const mockSource = vi.fn();
const mockLayer = vi.fn();

vi.mock('react-map-gl/maplibre', () => ({
  Source: (props: Record<string, unknown>) => {
    mockSource(props);
    return <div data-testid="source">{props.children as React.ReactNode}</div>;
  },
  Layer: (props: Record<string, unknown>) => {
    mockLayer(props);
    return <div data-testid="layer" />;
  },
}));

const mockUseIsochronesStore = vi.fn();

vi.mock('@/stores/isochrones-store', () => ({
  useIsochronesStore: (selector: (state: unknown) => unknown) =>
    mockUseIsochronesStore(selector),
}));

const polygon = (contour: number, fill: string) => ({
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  },
  properties: { contour, fill },
});

/** Valhalla returns contours ascending, each carrying its own `fill`. */
const isochroneResponse = () => ({
  type: 'FeatureCollection',
  features: [polygon(5, '#ff0000'), polygon(10, '#00ff00')],
});

const createMockState = (overrides = {}) => ({
  results: {
    byProfile: [{ profile: 'car', data: isochroneResponse() }],
    show: { car: true },
  },
  successful: true,
  colorPalette: 'default',
  opacity: 0.4,
  ...overrides,
});

const createMultiProfileState = (overrides = {}) =>
  createMockState({
    results: {
      byProfile: [
        { profile: 'car', data: isochroneResponse() },
        { profile: 'emergency', data: isochroneResponse() },
      ],
      show: { car: true, emergency: true },
    },
    ...overrides,
  });

const renderWithState = (state: unknown) => {
  mockUseIsochronesStore.mockImplementation((selector) => selector(state));
  return render(<IsochronePolygons />);
};

const renderedFeatures = () =>
  mockSource.mock.calls[0]?.[0]?.data.features as {
    geometry: { type: string };
    properties: Record<string, unknown>;
  }[];

describe('IsochronePolygons', () => {
  beforeEach(() => {
    mockSource.mockClear();
    mockLayer.mockClear();
    mockUseIsochronesStore.mockClear();
  });

  it('should render nothing when no profile returned isochrones', () => {
    const { container } = renderWithState(
      createMockState({ results: { byProfile: [], show: {} } })
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when not successful', () => {
    const { container } = renderWithState(
      createMockState({ successful: false })
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when every profile is hidden', () => {
    const { container } = renderWithState(
      createMockState({
        results: {
          byProfile: [{ profile: 'car', data: isochroneResponse() }],
          show: { car: false },
        },
      })
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render Source when data is valid', () => {
    renderWithState(createMockState());

    expect(mockSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'isochrones', type: 'geojson' })
    );
  });

  it('should render two layers (fill and outline)', () => {
    renderWithState(createMockState());

    expect(mockLayer).toHaveBeenCalledTimes(2);
  });

  it('should render fill layer with correct paint', () => {
    renderWithState(createMockState());

    expect(mockLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'isochrones-fill',
        type: 'fill',
        paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': 0.4 },
      })
    );
  });

  it('should render outline layer with per-feature outline colour', () => {
    renderWithState(createMockState());

    expect(mockLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'isochrones-outline',
        type: 'line',
        paint: {
          'line-color': ['get', 'outline'],
          'line-width': 1,
          'line-opacity': 1,
        },
      })
    );
  });

  it('should filter only Polygon and MultiPolygon features', () => {
    renderWithState(
      createMockState({
        results: {
          byProfile: [
            {
              profile: 'car',
              data: {
                type: 'FeatureCollection',
                features: [
                  polygon(10, '#ff0000'),
                  {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [0, 0] },
                    properties: { type: 'snapped' },
                  },
                ],
              },
            },
          ],
          show: { car: true },
        },
      })
    );

    const features = renderedFeatures();
    expect(features).toHaveLength(1);
    expect(features?.[0]?.geometry.type).toBe('Polygon');
  });

  it('should order the largest contour first so smaller ones stay on top', () => {
    renderWithState(createMockState());

    expect(renderedFeatures()?.map((f) => f.properties.contour)).toEqual([
      10, 5,
    ]);
  });

  it("should keep Valhalla's own fill and a white outline for one profile on the default palette", () => {
    renderWithState(createMockState());

    const features = renderedFeatures() ?? [];
    expect(features.map((f) => f.properties.fill)).toEqual([
      '#00ff00',
      '#ff0000',
    ]);
    expect(features.every((f) => f.properties.outline === '#fff')).toBe(true);
  });

  it('should apply the selected palette for a single profile', () => {
    const viridis = ISOCHRONE_PALETTES.find((p) => p.id === 'viridis');
    const colors = viridis?.colors ?? [];

    renderWithState(createMockState({ colorPalette: 'viridis' }));

    const features = renderedFeatures() ?? [];
    expect(features[0]?.properties.fill).toBe(getPaletteColor(colors, 1));
    expect(features[1]?.properties.fill).toBe(getPaletteColor(colors, 0.5));
  });

  it('should colour contours per profile when several profiles are visible', () => {
    renderWithState(createMultiProfileState());

    const features = renderedFeatures() ?? [];
    expect(features).toHaveLength(4);

    const car = features.filter((f) => f.properties.profile === 'car');
    const emergency = features.filter(
      (f) => f.properties.profile === 'emergency'
    );

    expect(car.map((f) => f.properties.fill)).toEqual([
      getProfileContourColor('car', 1),
      getProfileContourColor('car', 0.5),
    ]);
    expect(emergency.map((f) => f.properties.fill)).toEqual([
      getProfileContourColor('emergency', 1),
      getProfileContourColor('emergency', 0.5),
    ]);
    expect(
      car.every((f) => f.properties.outline === getProfileColor('car'))
    ).toBe(true);
    expect(
      emergency.every(
        (f) => f.properties.outline === getProfileColor('emergency')
      )
    ).toBe(true);
  });

  it('should drop hidden profiles but keep the remaining one in its own colour', () => {
    renderWithState(
      createMultiProfileState({
        results: {
          byProfile: [
            { profile: 'car', data: isochroneResponse() },
            { profile: 'emergency', data: isochroneResponse() },
          ],
          show: { car: true, emergency: false },
        },
      })
    );

    const features = renderedFeatures() ?? [];
    expect(features).toHaveLength(2);
    expect(features.every((f) => f.properties.profile === 'car')).toBe(true);
    // Two profiles were routed, so car keeps the profile ramp it had while
    // both were visible — otherwise it would no longer match its colour key.
    expect(features.map((f) => f.properties.fill)).toEqual([
      getProfileContourColor('car', 1),
      getProfileContourColor('car', 0.5),
    ]);
    expect(
      features.every((f) => f.properties.outline === getProfileColor('car'))
    ).toBe(true);
  });
});
