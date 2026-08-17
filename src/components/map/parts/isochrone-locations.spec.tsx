import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { IsochroneLocations } from './isochrone-locations';

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

const snappedPoint = (coordinates: number[]) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates },
  properties: { type: 'snapped' },
});

const isochroneResponse = (coordinates: number[]) => ({
  type: 'FeatureCollection',
  features: [snappedPoint(coordinates)],
});

const createMockState = (overrides = {}) => ({
  results: {
    byProfile: [{ profile: 'car', data: isochroneResponse([10, 50]) }],
    show: { car: true },
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
          byProfile: [{ profile: 'car', data: isochroneResponse([10, 50]) }],
          show: { car: false },
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
          byProfile: [
            {
              profile: 'car',
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
          show: { car: true },
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
          byProfile: [
            {
              profile: 'car',
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
          show: { car: true },
        },
      })
    );

    const features = renderedFeatures();
    expect(features).toHaveLength(1);
    expect(features?.[0]?.properties.type).toBe('snapped');
  });

  it('should draw locations from the first visible profile only', () => {
    renderWithState(
      createMockState({
        results: {
          byProfile: [
            { profile: 'car', data: isochroneResponse([10, 50]) },
            { profile: 'emergency', data: isochroneResponse([20, 60]) },
          ],
          show: { car: true, emergency: true },
        },
      })
    );

    const features = renderedFeatures();
    expect(features).toHaveLength(1);
    expect(features?.[0]?.geometry.coordinates).toEqual([10, 50]);
  });

  it('should fall back to the next profile when the first one is hidden', () => {
    renderWithState(
      createMockState({
        results: {
          byProfile: [
            { profile: 'car', data: isochroneResponse([10, 50]) },
            { profile: 'emergency', data: isochroneResponse([20, 60]) },
          ],
          show: { car: false, emergency: true },
        },
      })
    );

    const features = renderedFeatures();
    expect(features).toHaveLength(1);
    expect(features?.[0]?.geometry.coordinates).toEqual([20, 60]);
  });
});
