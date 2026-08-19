import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { HighlightSegment } from './highlight-segment';

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

// The component resolves coordinates through `getRouteAt`, so the real module
// exports have to survive the mock — only the hook is replaced.
vi.mock('@/stores/directions-store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/stores/directions-store')>();

  return {
    ...actual,
    useDirectionsStore: (selector: (state: unknown) => unknown) =>
      mockUseDirectionsStore(selector),
  };
});

const publicCar = { instanceId: 'public', profile: 'car' as const };
const publicEmergency = { instanceId: 'public', profile: 'emergency' as const };
const localCar = { instanceId: 'local', profile: 'car' as const };

const carRoute = {
  decodedGeometry: [
    [50, 10],
    [51, 11],
    [52, 12],
    [53, 13],
  ],
  alternates: [
    {
      decodedGeometry: [
        [60, 20],
        [61, 21],
        [62, 22],
        [63, 23],
      ],
    },
  ],
};

const emergencyRoute = {
  decodedGeometry: [
    [70, 30],
    [71, 31],
    [72, 32],
    [73, 33],
  ],
  alternates: [],
};

/** The same profile, routed on the other server — a different target. */
const localCarRoute = {
  decodedGeometry: [
    [80, 40],
    [81, 41],
    [82, 42],
    [83, 43],
  ],
  alternates: [],
};

const createMockState = (overrides = {}) => ({
  results: {
    byTarget: [
      { target: publicCar, data: carRoute },
      { target: publicEmergency, data: emergencyRoute },
    ],
    failures: [],
    show: {},
  },
  highlightSegment: {
    ...publicCar,
    startIndex: 1,
    endIndex: 2,
    index: 0,
  },
  ...overrides,
});

const renderWithState = (state: unknown) => {
  mockUseDirectionsStore.mockImplementation((selector) => selector(state));
  return render(<HighlightSegment />);
};

const renderedCoordinates = () =>
  mockSource.mock.calls[0]?.[0]?.data.geometry.coordinates as number[][];

describe('HighlightSegment', () => {
  beforeEach(() => {
    mockSource.mockClear();
    mockLayer.mockClear();
    mockUseDirectionsStore.mockClear();
  });

  it('should render nothing when highlightSegment is null', () => {
    const { container } = renderWithState(
      createMockState({ highlightSegment: null })
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when there are no route results', () => {
    const { container } = renderWithState(
      createMockState({ results: { byTarget: [], failures: [], show: {} } })
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when the referenced target has no result', () => {
    const { container } = renderWithState(
      createMockState({
        results: {
          byTarget: [{ target: publicCar, data: carRoute }],
          failures: [],
          show: {},
        },
        highlightSegment: {
          ...publicEmergency,
          startIndex: 1,
          endIndex: 2,
          index: 0,
        },
      })
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when only another instance ran that profile', () => {
    const { container } = renderWithState(
      createMockState({
        results: {
          byTarget: [{ target: localCar, data: localCarRoute }],
          failures: [],
          show: {},
        },
        highlightSegment: {
          ...publicCar,
          startIndex: 1,
          endIndex: 2,
          index: 0,
        },
      })
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render Source when data is valid', () => {
    renderWithState(createMockState());

    expect(mockSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'highlight-segment', type: 'geojson' })
    );
  });

  it('should render Layer with yellow color', () => {
    renderWithState(createMockState());

    expect(mockLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'highlight-segment-line',
        type: 'line',
        paint: { 'line-color': 'yellow', 'line-width': 4, 'line-opacity': 1 },
      })
    );
  });

  it('should slice coordinates based on startIndex and endIndex', () => {
    renderWithState(createMockState());

    const coords = renderedCoordinates();
    expect(coords).toHaveLength(2);
    expect(coords[0]).toEqual([11, 51]);
    expect(coords[1]).toEqual([12, 52]);
  });

  it('should resolve the segment against the referenced profile', () => {
    renderWithState(
      createMockState({
        highlightSegment: {
          ...publicEmergency,
          startIndex: 1,
          endIndex: 2,
          index: 0,
        },
      })
    );

    const coords = renderedCoordinates();
    expect(coords[0]).toEqual([31, 71]);
    expect(coords[1]).toEqual([32, 72]);
  });

  it("should resolve the segment against that target's alternate", () => {
    renderWithState(
      createMockState({
        highlightSegment: {
          ...publicCar,
          startIndex: 1,
          endIndex: 2,
          index: 1,
        },
      })
    );

    const coords = renderedCoordinates();
    expect(coords[0]).toEqual([21, 61]);
    expect(coords[1]).toEqual([22, 62]);
  });

  it('should tell the same profile on two instances apart', () => {
    const byTarget = [
      { target: publicCar, data: carRoute },
      { target: localCar, data: localCarRoute },
    ];

    renderWithState(
      createMockState({
        results: { byTarget, failures: [], show: {} },
        highlightSegment: {
          ...localCar,
          startIndex: 1,
          endIndex: 2,
          index: 0,
        },
      })
    );

    // Matching on profile alone would pick the public server's line first.
    const coords = renderedCoordinates();
    expect(coords[0]).toEqual([41, 81]);
    expect(coords[1]).toEqual([42, 82]);
  });

  it('should render nothing when startIndex is -1', () => {
    const { container } = renderWithState(
      createMockState({
        highlightSegment: {
          ...publicCar,
          startIndex: -1,
          endIndex: 2,
          index: 0,
        },
      })
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when endIndex is -1', () => {
    const { container } = renderWithState(
      createMockState({
        highlightSegment: {
          ...publicCar,
          startIndex: 0,
          endIndex: -1,
          index: 0,
        },
      })
    );

    expect(container.firstChild).toBeNull();
  });
});
