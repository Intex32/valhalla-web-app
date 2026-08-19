import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { IsochroneLocations } from './isochrone-locations';
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

const publicCar: TargetRef = { instanceId: 'public', profile: 'car' };
const publicEmergency: TargetRef = {
  instanceId: 'public',
  profile: 'emergency',
};
const localCar: TargetRef = { instanceId: 'local', profile: 'car' };

const snappedPoint = (coordinates: number[]) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates },
  properties: { type: 'snapped' },
});

const isochroneResponse = (coordinates: number[]) => ({
  type: 'FeatureCollection',
  features: [snappedPoint(coordinates)],
});

const showAll = (targets: TargetRef[]) =>
  Object.fromEntries(targets.map((target) => [targetKey(target), true]));

const createMockState = (overrides = {}) => ({
  results: {
    byTarget: [{ target: publicCar, data: isochroneResponse([10, 50]) }],
    failures: [],
    show: showAll([publicCar]),
  },
  successful: true,
  ...overrides,
});

const renderWithState = (state: unknown) => {
  mockUseIsochronesStore.mockImplementation((selector) => selector(state));
  return render(<IsochroneLocations />);
};

const renderedFeatures = () =>
  mockSource.mock.calls[0]?.[0]?.data.features as {
    geometry: { type: string; coordinates: number[] };
    properties: Record<string, unknown>;
  }[];

describe('IsochroneLocations', () => {
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
          byTarget: [{ target: publicCar, data: isochroneResponse([10, 50]) }],
          failures: [],
          show: { [targetKey(publicCar)]: false },
        },
      })
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render Source when data is valid', () => {
    renderWithState(createMockState());

    expect(mockSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'iso-locations', type: 'geojson' })
    );
  });

  it('should render Layer with circle type', () => {
    renderWithState(createMockState());

    expect(mockLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'iso-locations-circle',
        type: 'circle',
      })
    );
  });

  it('should render Layer with correct paint properties', () => {
    renderWithState(createMockState());

    expect(mockLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        paint: {
          'circle-radius': 6,
          'circle-color': '#fff',
          'circle-stroke-color': '#000',
          'circle-stroke-width': 2,
        },
      })
    );
  });

  it('should filter out Polygon features', () => {
    renderWithState(
      createMockState({
        results: {
          byTarget: [
            {
              target: publicCar,
              data: {
                type: 'FeatureCollection',
                features: [
                  {
                    type: 'Feature',
                    geometry: { type: 'Polygon', coordinates: [] },
                    properties: { fill: '#ff0000' },
                  },
                  snappedPoint([0, 0]),
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
    expect(features?.[0]?.geometry.type).toBe('Point');
  });

  it('should filter out input type features', () => {
    renderWithState(
      createMockState({
        results: {
          byTarget: [
            {
              target: publicCar,
              data: {
                type: 'FeatureCollection',
                features: [
                  {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [0, 0] },
                    properties: { type: 'input' },
                  },
                  snappedPoint([1, 1]),
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
    expect(features?.[0]?.properties.type).toBe('snapped');
  });

  it('should draw locations from the first visible target of an instance only', () => {
    renderWithState(
      createMockState({
        results: {
          byTarget: [
            { target: publicCar, data: isochroneResponse([10, 50]) },
            { target: publicEmergency, data: isochroneResponse([20, 60]) },
          ],
          failures: [],
          show: showAll([publicCar, publicEmergency]),
        },
      })
    );

    // Every profile on one server snaps to the same centre, so one marker.
    const features = renderedFeatures();
    expect(features).toHaveLength(1);
    expect(features?.[0]?.geometry.coordinates).toEqual([10, 50]);
  });

  it('should fall back to the next target of the instance when the first is hidden', () => {
    renderWithState(
      createMockState({
        results: {
          byTarget: [
            { target: publicCar, data: isochroneResponse([10, 50]) },
            { target: publicEmergency, data: isochroneResponse([20, 60]) },
          ],
          failures: [],
          show: {
            [targetKey(publicCar)]: false,
            [targetKey(publicEmergency)]: true,
          },
        },
      })
    );

    const features = renderedFeatures();
    expect(features).toHaveLength(1);
    expect(features?.[0]?.geometry.coordinates).toEqual([20, 60]);
  });

  it('should draw one marker per instance because tilesets snap differently', () => {
    renderWithState(
      createMockState({
        results: {
          byTarget: [
            { target: publicCar, data: isochroneResponse([10, 50]) },
            { target: publicEmergency, data: isochroneResponse([11, 51]) },
            { target: localCar, data: isochroneResponse([20, 60]) },
          ],
          failures: [],
          show: showAll([publicCar, publicEmergency, localCar]),
        },
      })
    );

    const features = renderedFeatures();
    expect(features).toHaveLength(2);
    expect(features?.map((f) => f.geometry.coordinates)).toEqual([
      [10, 50],
      [20, 60],
    ]);
  });

  it('should keep the other instance marker when one instance is hidden', () => {
    renderWithState(
      createMockState({
        results: {
          byTarget: [
            { target: publicCar, data: isochroneResponse([10, 50]) },
            { target: localCar, data: isochroneResponse([20, 60]) },
          ],
          failures: [],
          show: {
            [targetKey(publicCar)]: false,
            [targetKey(localCar)]: true,
          },
        },
      })
    );

    const features = renderedFeatures();
    expect(features).toHaveLength(1);
    expect(features?.[0]?.geometry.coordinates).toEqual([20, 60]);
  });
});
