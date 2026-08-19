import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { RouteLines } from './route-lines';
import { routeKey } from '@/stores/directions-store';
import { PROFILE_COLORS, getTargetColor } from '@/utils/profile-colors';
import type { TargetRef } from '@/utils/targets';

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

const mockUseDirectionsStore = vi.fn();

// `routeKey` and `sameTarget` are imported by the component itself, so the
// factory has to keep the real module's exports around and only swap the hook.
vi.mock('@/stores/directions-store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/stores/directions-store')>();

  return {
    ...actual,
    useDirectionsStore: (selector: (state: unknown) => unknown) =>
      mockUseDirectionsStore(selector),
  };
});

// Two instances, in a fixed order: `instanceIndex` (kept real) turns that
// order into the colour shade, so 'public' is 0 and 'local' is 1.
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

const publicCar = { instanceId: 'public', profile: 'car' as const };
const publicEmergency = { instanceId: 'public', profile: 'emergency' as const };
const localCar = { instanceId: 'local', profile: 'car' as const };
const ghostCar = { instanceId: 'ghost', profile: 'car' as const };

const carRoute = {
  decodedGeometry: [
    [50, 10],
    [51, 11],
  ],
  trip: { summary: { length: 100, time: 3600 } },
  alternates: [
    {
      decodedGeometry: [
        [52, 12],
        [53, 13],
      ],
      trip: { summary: { length: 120, time: 4200 } },
    },
  ],
};

const emergencyRoute = {
  decodedGeometry: [
    [40, 8],
    [41, 9],
  ],
  trip: { summary: { length: 80, time: 2400 } },
  alternates: [],
};

const localCarRoute = {
  decodedGeometry: [
    [30, 6],
    [31, 7],
  ],
  trip: { summary: { length: 90, time: 3000 } },
  alternates: [],
};

/** Every route of every target visible. */
const showAll = (
  entries: { target: TargetRef; data: { alternates?: unknown[] } }[]
) => {
  const show: Record<string, boolean> = {};
  for (const { target, data } of entries) {
    show[routeKey(target, 0)] = true;
    data.alternates?.forEach((_, i) => {
      show[routeKey(target, i + 1)] = true;
    });
  }
  return show;
};

const createMockState = (overrides = {}) => {
  const byTarget = [
    { target: publicCar, data: { ...carRoute, alternates: [] } },
  ];

  return {
    results: { byTarget, failures: [], show: showAll(byTarget) },
    successful: true,
    activeRoute: { ...publicCar, index: 0 },
    ...overrides,
  };
};

/** Two profiles on one instance, the first of which also has an alternate. */
const createMultiProfileState = (overrides = {}) => {
  const byTarget = [
    { target: publicCar, data: carRoute },
    { target: publicEmergency, data: emergencyRoute },
  ];

  return createMockState({
    results: { byTarget, failures: [], show: showAll(byTarget) },
    ...overrides,
  });
};

/** The same profile on two servers — two independent targets. */
const createMultiInstanceState = (overrides = {}) => {
  const byTarget = [
    { target: publicCar, data: { ...carRoute, alternates: [] } },
    { target: localCar, data: localCarRoute },
  ];

  return createMockState({
    results: { byTarget, failures: [], show: showAll(byTarget) },
    ...overrides,
  });
};

const renderWithState = (state: unknown) => {
  mockUseDirectionsStore.mockImplementation((selector) => selector(state));
  return render(<RouteLines />);
};

const renderedFeatures = () =>
  mockSource.mock.calls[0]?.[0]?.data.features as {
    geometry: { coordinates: number[][] };
    properties: Record<string, unknown>;
  }[];

describe('RouteLines', () => {
  beforeEach(() => {
    mockSource.mockClear();
    mockLayer.mockClear();
    mockUseDirectionsStore.mockClear();
  });

  it('should render nothing when no target returned a route', () => {
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

  it('should render Source when data is valid', () => {
    renderWithState(createMockState());

    expect(mockSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'routes', type: 'geojson' })
    );
  });

  it('should render three layers (outline, line, hit-target)', () => {
    renderWithState(createMockState());

    expect(mockLayer).toHaveBeenCalledTimes(3);
    expect(mockLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'routes-hit-target' })
    );
  });

  it('should render outline layer with white color', () => {
    renderWithState(createMockState());

    expect(mockLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'routes-outline',
        type: 'line',
        paint: { 'line-color': '#FFF', 'line-width': 9, 'line-opacity': 1 },
      })
    );
  });

  it('should render line layer with per-feature color and active-route emphasis', () => {
    renderWithState(createMockState());

    expect(mockLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'routes-line',
        type: 'line',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['case', ['get', 'isActive'], 6, 4],
          'line-opacity': ['case', ['get', 'isActive'], 1, 0.6],
        },
      })
    );
  });

  it('should convert lat/lng to lng/lat format', () => {
    renderWithState(createMockState());

    const coords = renderedFeatures()?.[0]?.geometry.coordinates;
    expect(coords?.[0]).toEqual([10, 50]);
    expect(coords?.[1]).toEqual([11, 51]);
  });

  it('should emit one feature per target/route pair', () => {
    renderWithState(createMultiProfileState());

    const features = renderedFeatures();
    expect(features).toHaveLength(3);
    expect(
      features?.map((f) => [
        f.properties.instanceId,
        f.properties.profile,
        f.properties.routeIndex,
      ])
    ).toEqual(
      expect.arrayContaining([
        ['public', 'car', 0],
        ['public', 'car', 1],
        ['public', 'emergency', 0],
      ])
    );
  });

  it('should tag each feature with target, route index, type and summary', () => {
    renderWithState(createMultiProfileState());

    const features = renderedFeatures() ?? [];
    const main = features.find(
      (f) => f.properties.profile === 'car' && f.properties.routeIndex === 0
    );
    const alternate = features.find(
      (f) => f.properties.profile === 'car' && f.properties.routeIndex === 1
    );

    expect(main?.properties.instanceId).toBe('public');
    expect(main?.properties.type).toBe('main');
    expect(main?.properties.summary).toEqual({ length: 100, time: 3600 });
    expect(alternate?.properties.type).toBe('alternate');
    expect(alternate?.properties.summary).toEqual({ length: 120, time: 4200 });
  });

  it('should colour each profile with its own hue', () => {
    renderWithState(createMultiProfileState());

    const features = renderedFeatures() ?? [];
    const car = features.find(
      (f) => f.properties.profile === 'car' && f.properties.routeIndex === 0
    );
    const emergency = features.find(
      (f) => f.properties.profile === 'emergency'
    );

    expect(car?.properties.color).toBe(PROFILE_COLORS.car);
    expect(emergency?.properties.color).toBe(PROFILE_COLORS.emergency);
  });

  it('should fade alternates away from their target colour', () => {
    renderWithState(createMultiProfileState());

    const alternate = renderedFeatures()?.find(
      (f) => f.properties.profile === 'car' && f.properties.routeIndex === 1
    );

    expect(alternate?.properties.color).not.toBe(PROFILE_COLORS.car);
  });

  it('should draw the same profile from two instances as two features in different shades', () => {
    renderWithState(createMultiInstanceState());

    const features = renderedFeatures() ?? [];
    expect(features).toHaveLength(2);

    const fromPublic = features.find(
      (f) => f.properties.instanceId === 'public'
    );
    const fromLocal = features.find((f) => f.properties.instanceId === 'local');

    expect(fromPublic?.properties.profile).toBe('car');
    expect(fromLocal?.properties.profile).toBe('car');
    // Instance 0 keeps the untouched profile hue; instance 1 is shifted.
    expect(fromPublic?.properties.color).toBe(getTargetColor(0, 'car'));
    expect(fromLocal?.properties.color).toBe(getTargetColor(1, 'car'));
    expect(fromPublic?.properties.color).not.toBe(fromLocal?.properties.color);
  });

  it('should keep the geometries of the two instances apart', () => {
    renderWithState(createMultiInstanceState());

    const features = renderedFeatures() ?? [];
    const fromPublic = features.find(
      (f) => f.properties.instanceId === 'public'
    );
    const fromLocal = features.find((f) => f.properties.instanceId === 'local');

    expect(fromPublic?.geometry.coordinates[0]).toEqual([10, 50]);
    expect(fromLocal?.geometry.coordinates[0]).toEqual([6, 30]);
  });

  it('should skip targets whose instance is no longer in the list', () => {
    const byTarget = [
      { target: publicCar, data: { ...carRoute, alternates: [] } },
      { target: ghostCar, data: localCarRoute },
    ];

    renderWithState(
      createMockState({
        results: { byTarget, failures: [], show: showAll(byTarget) },
      })
    );

    const features = renderedFeatures() ?? [];
    expect(features).toHaveLength(1);
    expect(features[0]?.properties.instanceId).toBe('public');
  });

  it('should emit no features when every result belongs to an unknown instance', () => {
    const byTarget = [{ target: ghostCar, data: localCarRoute }];

    renderWithState(
      createMockState({
        results: { byTarget, failures: [], show: showAll(byTarget) },
        activeRoute: { ...ghostCar, index: 0 },
      })
    );

    expect(renderedFeatures()).toHaveLength(0);
  });

  it('should mark only the active route as active and draw it last', () => {
    renderWithState(createMultiProfileState());

    const features = renderedFeatures() ?? [];
    const active = features.filter((f) => f.properties.isActive);

    expect(active).toHaveLength(1);
    expect(active[0]?.properties.profile).toBe('car');
    expect(active[0]?.properties.routeIndex).toBe(0);
    expect(features[features.length - 1]?.properties.isActive).toBe(true);
  });

  it('should follow the active route across profiles', () => {
    renderWithState(
      createMultiProfileState({
        activeRoute: { ...publicEmergency, index: 0 },
      })
    );

    const features = renderedFeatures() ?? [];
    expect(features[features.length - 1]?.properties.profile).toBe('emergency');
    expect(features[features.length - 1]?.properties.isActive).toBe(true);
  });

  it('should not treat the same profile on another instance as active', () => {
    renderWithState(
      createMultiInstanceState({ activeRoute: { ...localCar, index: 0 } })
    );

    const features = renderedFeatures() ?? [];
    const active = features.filter((f) => f.properties.isActive);

    expect(active).toHaveLength(1);
    expect(active[0]?.properties.instanceId).toBe('local');
  });

  it('should skip routes hidden via show', () => {
    renderWithState(
      createMultiProfileState({
        results: {
          byTarget: [
            { target: publicCar, data: carRoute },
            { target: publicEmergency, data: emergencyRoute },
          ],
          failures: [],
          show: {
            [routeKey(publicCar, 0)]: true,
            [routeKey(publicCar, 1)]: false,
            [routeKey(publicEmergency, 0)]: false,
          },
        },
      })
    );

    const features = renderedFeatures() ?? [];
    expect(features).toHaveLength(1);
    expect(features[0]?.properties.profile).toBe('car');
    expect(features[0]?.properties.routeIndex).toBe(0);
  });

  it('should hide one instance without hiding the same profile on the other', () => {
    renderWithState(
      createMultiInstanceState({
        results: {
          byTarget: [
            { target: publicCar, data: { ...carRoute, alternates: [] } },
            { target: localCar, data: localCarRoute },
          ],
          failures: [],
          show: {
            [routeKey(publicCar, 0)]: false,
            [routeKey(localCar, 0)]: true,
          },
        },
      })
    );

    const features = renderedFeatures() ?? [];
    expect(features).toHaveLength(1);
    expect(features[0]?.properties.instanceId).toBe('local');
  });
});
