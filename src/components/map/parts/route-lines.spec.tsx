import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { RouteLines } from './route-lines';
import { PROFILE_COLORS } from '@/utils/profile-colors';

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

// `routeKey` is imported by the component itself, so the factory has to keep
// the real module's exports around and only swap out the hook.
vi.mock('@/stores/directions-store', async () => {
  const actual = await vi.importActual<
    typeof import('@/stores/directions-store')
  >('@/stores/directions-store');

  return {
    ...actual,
    useDirectionsStore: (selector: (state: unknown) => unknown) =>
      mockUseDirectionsStore(selector),
  };
});

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

const createMockState = (overrides = {}) => ({
  results: {
    byProfile: [{ profile: 'car', data: { ...carRoute, alternates: [] } }],
    show: { 'car:0': true },
  },
  successful: true,
  activeRoute: { profile: 'car', index: 0 },
  ...overrides,
});

/** Two profiles, the first of which also has an alternate. */
const createMultiProfileState = (overrides = {}) =>
  createMockState({
    results: {
      byProfile: [
        { profile: 'car', data: carRoute },
        { profile: 'emergency', data: emergencyRoute },
      ],
      show: { 'car:0': true, 'car:1': true, 'emergency:0': true },
    },
    ...overrides,
  });

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

  it('should render nothing when no profile returned a route', () => {
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

  it('should emit one feature per profile/route pair', () => {
    renderWithState(createMultiProfileState());

    const features = renderedFeatures();
    expect(features).toHaveLength(3);
    expect(
      features?.map((f) => [f.properties.profile, f.properties.routeIndex])
    ).toEqual(
      expect.arrayContaining([
        ['car', 0],
        ['car', 1],
        ['emergency', 0],
      ])
    );
  });

  it('should tag each feature with profile, route index, type and summary', () => {
    renderWithState(createMultiProfileState());

    const features = renderedFeatures() ?? [];
    const main = features.find(
      (f) => f.properties.profile === 'car' && f.properties.routeIndex === 0
    );
    const alternate = features.find(
      (f) => f.properties.profile === 'car' && f.properties.routeIndex === 1
    );

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

  it('should fade alternates away from their profile colour', () => {
    renderWithState(createMultiProfileState());

    const alternate = renderedFeatures()?.find(
      (f) => f.properties.profile === 'car' && f.properties.routeIndex === 1
    );

    expect(alternate?.properties.color).not.toBe(PROFILE_COLORS.car);
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
        activeRoute: { profile: 'emergency', index: 0 },
      })
    );

    const features = renderedFeatures() ?? [];
    expect(features[features.length - 1]?.properties.profile).toBe('emergency');
    expect(features[features.length - 1]?.properties.isActive).toBe(true);
  });

  it('should skip routes hidden via show', () => {
    renderWithState(
      createMultiProfileState({
        results: {
          byProfile: [
            { profile: 'car', data: carRoute },
            { profile: 'emergency', data: emergencyRoute },
          ],
          show: { 'car:0': true, 'car:1': false, 'emergency:0': false },
        },
      })
    );

    const features = renderedFeatures() ?? [];
    expect(features).toHaveLength(1);
    expect(features[0]?.properties.profile).toBe('car');
    expect(features[0]?.properties.routeIndex).toBe(0);
  });
});
