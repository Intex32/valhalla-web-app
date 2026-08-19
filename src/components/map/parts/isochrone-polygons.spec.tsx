import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { IsochronePolygons } from './isochrone-polygons';
import { getTargetColor, getTargetContourColor } from '@/utils/profile-colors';
import {
  ISOCHRONE_PALETTES,
  getPaletteColor,
} from '@/utils/isochrone-palettes';
import { targetKey, type TargetRef } from '@/utils/targets';

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

vi.mock('@/stores/isochrones-store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/stores/isochrones-store')>();

  return {
    ...actual,
    useIsochronesStore: (selector: (state: unknown) => unknown) =>
      mockUseIsochronesStore(selector),
  };
});

// Two instances in a fixed order: `instanceIndex` (kept real) turns that order
// into the colour shade, so 'public' is 0 and 'local' is 1.
const { mockInstances } = vi.hoisted(() => ({
  mockInstances: [
    {
      id: 'public',
      label: 'Public',
      url: 'https://valhalla1.openstreetmap.de',
    },
    { id: 'local', label: 'Local', url: 'http://localhost:8002' },
  ],
}));

vi.mock('@/stores/instances-store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/stores/instances-store')>();

  return {
    ...actual,
    useInstancesStore: (selector: (state: unknown) => unknown) =>
      selector({ instances: mockInstances }),
  };
});

const publicCar: TargetRef = { instanceId: 'public', profile: 'car' };
const publicEmergency: TargetRef = {
  instanceId: 'public',
  profile: 'emergency',
};
const localCar: TargetRef = { instanceId: 'local', profile: 'car' };
const ghostCar: TargetRef = { instanceId: 'ghost', profile: 'car' };

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

const showAll = (targets: TargetRef[]) =>
  Object.fromEntries(targets.map((target) => [targetKey(target), true]));

const createMockState = (overrides = {}) => ({
  results: {
    byTarget: [{ target: publicCar, data: isochroneResponse() }],
    failures: [],
    show: showAll([publicCar]),
  },
  successful: true,
  colorPalette: 'default',
  opacity: 0.4,
  ...overrides,
});

/** Two profiles on the same server. */
const createMultiProfileState = (overrides = {}) =>
  createMockState({
    results: {
      byTarget: [
        { target: publicCar, data: isochroneResponse() },
        { target: publicEmergency, data: isochroneResponse() },
      ],
      failures: [],
      show: showAll([publicCar, publicEmergency]),
    },
    ...overrides,
  });

/** The same profile on two servers — two independent targets. */
const createMultiInstanceState = (overrides = {}) =>
  createMockState({
    results: {
      byTarget: [
        { target: publicCar, data: isochroneResponse() },
        { target: localCar, data: isochroneResponse() },
      ],
      failures: [],
      show: showAll([publicCar, localCar]),
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

  it('should render nothing when no target returned isochrones', () => {
    const { container } = renderWithState(
      createMockState({ results: { byTarget: [], failures: [], show: {} } })
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when not successful', () => {
    const { container } = renderWithState(
      createMockState({ successful: false })
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when every target is hidden', () => {
    const { container } = renderWithState(
      createMockState({
        results: {
          byTarget: [{ target: publicCar, data: isochroneResponse() }],
          failures: [],
          show: { [targetKey(publicCar)]: false },
        },
      })
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when every target belongs to an unknown instance', () => {
    const { container } = renderWithState(
      createMockState({
        results: {
          byTarget: [{ target: ghostCar, data: isochroneResponse() }],
          failures: [],
          show: showAll([ghostCar]),
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
          byTarget: [
            {
              target: publicCar,
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
          failures: [],
          show: showAll([publicCar]),
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

  it('should tag each feature with the target that produced it', () => {
    renderWithState(createMultiInstanceState());

    const features = renderedFeatures() ?? [];
    expect(
      features.map((f) => [f.properties.instanceId, f.properties.profile])
    ).toEqual(
      expect.arrayContaining([
        ['public', 'car'],
        ['local', 'car'],
      ])
    );
  });

  it("should keep Valhalla's own fill and a white outline for one target on the default palette", () => {
    renderWithState(createMockState());

    const features = renderedFeatures() ?? [];
    expect(features.map((f) => f.properties.fill)).toEqual([
      '#00ff00',
      '#ff0000',
    ]);
    expect(features.every((f) => f.properties.outline === '#fff')).toBe(true);
  });

  it('should apply the selected palette for a single target', () => {
    const viridis = ISOCHRONE_PALETTES.find((p) => p.id === 'viridis');
    const colors = viridis?.colors ?? [];

    renderWithState(createMockState({ colorPalette: 'viridis' }));

    const features = renderedFeatures() ?? [];
    expect(features[0]?.properties.fill).toBe(getPaletteColor(colors, 1));
    expect(features[1]?.properties.fill).toBe(getPaletteColor(colors, 0.5));
  });

  it('should colour contours per target when several targets are visible', () => {
    renderWithState(createMultiProfileState());

    const features = renderedFeatures() ?? [];
    expect(features).toHaveLength(4);

    const car = features.filter((f) => f.properties.profile === 'car');
    const emergency = features.filter(
      (f) => f.properties.profile === 'emergency'
    );

    expect(car.map((f) => f.properties.fill)).toEqual([
      getTargetContourColor(0, 'car', 1),
      getTargetContourColor(0, 'car', 0.5),
    ]);
    expect(emergency.map((f) => f.properties.fill)).toEqual([
      getTargetContourColor(0, 'emergency', 1),
      getTargetContourColor(0, 'emergency', 0.5),
    ]);
    expect(
      car.every((f) => f.properties.outline === getTargetColor(0, 'car'))
    ).toBe(true);
    expect(
      emergency.every(
        (f) => f.properties.outline === getTargetColor(0, 'emergency')
      )
    ).toBe(true);
  });

  it('should shade the same profile differently per instance', () => {
    renderWithState(createMultiInstanceState());

    const features = renderedFeatures() ?? [];
    expect(features).toHaveLength(4);

    const fromPublic = features.filter(
      (f) => f.properties.instanceId === 'public'
    );
    const fromLocal = features.filter(
      (f) => f.properties.instanceId === 'local'
    );

    expect(fromPublic.map((f) => f.properties.fill)).toEqual([
      getTargetContourColor(0, 'car', 1),
      getTargetContourColor(0, 'car', 0.5),
    ]);
    expect(fromLocal.map((f) => f.properties.fill)).toEqual([
      getTargetContourColor(1, 'car', 1),
      getTargetContourColor(1, 'car', 0.5),
    ]);
    // Same hue family, different shade — otherwise the two servers' contours
    // would be indistinguishable on the map.
    expect(fromPublic[0]?.properties.fill).not.toBe(
      fromLocal[0]?.properties.fill
    );
    expect(fromPublic[0]?.properties.outline).toBe(getTargetColor(0, 'car'));
    expect(fromLocal[0]?.properties.outline).toBe(getTargetColor(1, 'car'));
  });

  it('should drop targets on a removed instance, palette-colouring the one left', () => {
    renderWithState(
      createMultiInstanceState({
        results: {
          byTarget: [
            { target: publicCar, data: isochroneResponse() },
            { target: ghostCar, data: isochroneResponse() },
          ],
          failures: [],
          show: showAll([publicCar, ghostCar]),
        },
      })
    );

    const features = renderedFeatures() ?? [];
    expect(features).toHaveLength(2);
    expect(features.every((f) => f.properties.instanceId === 'public')).toBe(
      true
    );
    // Only one *known* target was routed, so this is single-target colouring
    // again — Valhalla's own fill and a white outline.
    expect(features.map((f) => f.properties.fill)).toEqual([
      '#00ff00',
      '#ff0000',
    ]);
    expect(features.every((f) => f.properties.outline === '#fff')).toBe(true);
  });

  it('should drop hidden targets but keep the remaining one in its own colour', () => {
    renderWithState(
      createMultiProfileState({
        results: {
          byTarget: [
            { target: publicCar, data: isochroneResponse() },
            { target: publicEmergency, data: isochroneResponse() },
          ],
          failures: [],
          show: {
            [targetKey(publicCar)]: true,
            [targetKey(publicEmergency)]: false,
          },
        },
      })
    );

    const features = renderedFeatures() ?? [];
    expect(features).toHaveLength(2);
    expect(features.every((f) => f.properties.profile === 'car')).toBe(true);
    // Two targets were routed, so car keeps the target ramp it had while both
    // were visible — otherwise it would no longer match its colour key.
    expect(features.map((f) => f.properties.fill)).toEqual([
      getTargetContourColor(0, 'car', 1),
      getTargetContourColor(0, 'car', 0.5),
    ]);
    expect(
      features.every((f) => f.properties.outline === getTargetColor(0, 'car'))
    ).toBe(true);
  });

  it('should keep the target ramp when the other instance is hidden', () => {
    renderWithState(
      createMultiInstanceState({
        results: {
          byTarget: [
            { target: publicCar, data: isochroneResponse() },
            { target: localCar, data: isochroneResponse() },
          ],
          failures: [],
          show: {
            [targetKey(publicCar)]: false,
            [targetKey(localCar)]: true,
          },
        },
      })
    );

    const features = renderedFeatures() ?? [];
    expect(features).toHaveLength(2);
    expect(features.every((f) => f.properties.instanceId === 'local')).toBe(
      true
    );
    expect(features.map((f) => f.properties.fill)).toEqual([
      getTargetContourColor(1, 'car', 1),
      getTargetContourColor(1, 'car', 0.5),
    ]);
  });
});
