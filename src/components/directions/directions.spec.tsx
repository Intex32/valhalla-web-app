import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DirectionsControl } from './directions';

const mockNavigate = vi.fn();
const mockRefetchDirections = vi.fn();
const mockSetWaypointFromCoords = vi.fn().mockResolvedValue([]);
const mockAddEmptyWaypointToEnd = vi.fn();
const mockClearWaypoints = vi.fn();
const mockClearRoutes = vi.fn();
const mockSetActiveRoute = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: vi.fn(() => mockNavigate),
}));

vi.mock('@/utils/parse-url-params', () => ({
  parseUrlParams: vi.fn(() => ({})),
}));

const mockWaypoints = [
  { id: '0', geocodeResults: [], userInput: '' },
  { id: '1', geocodeResults: [], userInput: '' },
];

interface MockRoute {
  id?: string;
  trip: { summary: unknown; legs: unknown[] };
  alternates?: { id: string; trip: { summary: unknown; legs: unknown[] } }[];
}

const createMockRoute = (alternateIds: string[] = []): MockRoute => ({
  id: 'main',
  trip: { summary: {}, legs: [] },
  ...(alternateIds.length > 0
    ? {
        alternates: alternateIds.map((id) => ({
          id,
          trip: { summary: {}, legs: [] },
        })),
      }
    : {}),
});

const mockResults = {
  byProfile: [] as { profile: string; data: MockRoute }[],
  show: {} as Record<string, boolean>,
};

let mockActiveRoute: { profile: string; index: number } | null = null;

vi.mock('@/stores/directions-store', () => {
  const state = () => ({
    waypoints: mockWaypoints,
    results: mockResults,
    activeRoute: mockActiveRoute,
    isOptimized: false,
    addEmptyWaypointToEnd: mockAddEmptyWaypointToEnd,
    clearWaypoints: mockClearWaypoints,
    clearRoutes: mockClearRoutes,
    setActiveRoute: mockSetActiveRoute,
  });

  const useDirectionsStore = Object.assign(
    vi.fn((selector) => selector(state())),
    { getState: state }
  );

  return {
    defaultWaypoints: [
      { id: '0', geocodeResults: [], userInput: '' },
      { id: '1', geocodeResults: [], userInput: '' },
    ],
    routeKey: (profile: string, index: number) => `${profile}:${index}`,
    getRouteAt: (
      byProfile: { profile: string; data: MockRoute }[],
      { profile, index }: { profile: string; index: number }
    ) => {
      const entry = byProfile.find((route) => route.profile === profile);
      if (!entry) return null;
      return index === 0
        ? entry.data
        : (entry.data.alternates?.[index - 1] ?? null);
    },
    useDirectionsStore,
  };
});

vi.mock('@/hooks/use-directions-queries', () => ({
  useDirectionsQuery: vi.fn(() => ({
    refetch: mockRefetchDirections,
  })),
  useSetWaypointFromCoords: vi.fn(() => ({
    setWaypointFromCoords: mockSetWaypointFromCoords,
  })),
}));

vi.mock('@/hooks/use-optimized-route-query', () => ({
  useOptimizedRouteQuery: vi.fn(() => ({
    optimizeRoute: vi.fn(),
    isPending: false,
  })),
}));

vi.mock('./waypoints/waypoint-list', () => ({
  Waypoints: () => <div data-testid="mock-waypoints">Waypoints</div>,
}));

vi.mock('@/components/settings-footer', () => ({
  SettingsFooter: () => (
    <div data-testid="mock-settings-footer">Settings Footer</div>
  ),
}));

vi.mock('@/components/quick-settings', () => ({
  QuickSettings: () => (
    <div data-testid="mock-quick-settings">Quick Settings</div>
  ),
}));

vi.mock('./route-card', () => ({
  RouteCard: ({
    data,
    profile,
    index,
    isActive,
    onSelect,
  }: {
    data: unknown;
    profile: string;
    index: number;
    isActive: boolean;
    onSelect: () => void;
  }) => (
    <div
      data-testid={`mock-route-card-${profile}-${index}`}
      data-active={isActive}
      onClick={onSelect}
    >
      Route Card {profile} {index}: {JSON.stringify(data)}
    </div>
  ),
}));

describe('DirectionsControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResults.byProfile = [];
    mockResults.show = {};
    mockActiveRoute = null;
    mockWaypoints.length = 0;
    mockWaypoints.push(
      { id: '0', geocodeResults: [], userInput: '' },
      { id: '1', geocodeResults: [], userInput: '' }
    );
  });

  it('should render without crashing', () => {
    expect(() => render(<DirectionsControl />)).not.toThrow();
  });

  it('should render Waypoints component', () => {
    render(<DirectionsControl />);
    expect(screen.getByTestId('mock-waypoints')).toBeInTheDocument();
  });

  it('should render SettingsFooter component', () => {
    render(<DirectionsControl />);
    expect(screen.getByTestId('mock-settings-footer')).toBeInTheDocument();
  });

  it('should render QuickSettings component', () => {
    render(<DirectionsControl />);
    expect(screen.getByTestId('mock-quick-settings')).toBeInTheDocument();
  });

  it('should render Add Waypoint button', () => {
    render(<DirectionsControl />);
    expect(
      screen.getByRole('button', { name: /add waypoint/i })
    ).toBeInTheDocument();
  });

  it('should render Reset Waypoints button', () => {
    render(<DirectionsControl />);
    expect(
      screen.getByRole('button', { name: /reset waypoints/i })
    ).toBeInTheDocument();
  });

  it('should call addEmptyWaypointToEnd when Add Waypoint is clicked', async () => {
    const user = userEvent.setup();
    render(<DirectionsControl />);

    await user.click(screen.getByRole('button', { name: /add waypoint/i }));

    expect(mockAddEmptyWaypointToEnd).toHaveBeenCalled();
  });

  it('should call clearWaypoints and clearRoutes when Reset Waypoints is clicked', async () => {
    const user = userEvent.setup();
    mockWaypoints.length = 0;
    mockWaypoints.push(
      {
        id: '0',
        geocodeResults: [
          { selected: true, sourcelnglat: [13.4, 52.5] },
        ] as never[],
        userInput: 'Berlin',
      },
      { id: '1', geocodeResults: [], userInput: '' }
    );

    render(<DirectionsControl />);

    await user.click(screen.getByRole('button', { name: /reset waypoints/i }));

    expect(mockClearWaypoints).toHaveBeenCalled();
    expect(mockClearRoutes).toHaveBeenCalled();
  });

  it('should disable Reset Waypoints button when waypoints are default', () => {
    render(<DirectionsControl />);

    expect(
      screen.getByRole('button', { name: /reset waypoints/i })
    ).toBeDisabled();
  });

  it('should not render RouteCard when no results', () => {
    render(<DirectionsControl />);
    expect(
      screen.queryByTestId('mock-route-card-car-0')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Directions')).not.toBeInTheDocument();
  });

  it('should render RouteCard when results exist', () => {
    mockResults.byProfile = [{ profile: 'car', data: createMockRoute() }];

    render(<DirectionsControl />);

    expect(screen.getByText('Directions')).toBeInTheDocument();
    expect(screen.getByTestId('mock-route-card-car-0')).toBeInTheDocument();
  });

  it('should render alternate routes when available', () => {
    mockResults.byProfile = [
      { profile: 'car', data: createMockRoute(['alt-1', 'alt-2']) },
    ];

    render(<DirectionsControl />);

    expect(screen.getByTestId('mock-route-card-car-0')).toBeInTheDocument();
    expect(screen.getByTestId('mock-route-card-car-1')).toBeInTheDocument();
    expect(screen.getByTestId('mock-route-card-car-2')).toBeInTheDocument();
  });

  it('should render one card per profile when several profiles routed', () => {
    mockResults.byProfile = [
      { profile: 'car', data: createMockRoute(['car-alt']) },
      { profile: 'emergency', data: createMockRoute() },
    ];

    render(<DirectionsControl />);

    expect(screen.getByTestId('mock-route-card-car-0')).toBeInTheDocument();
    expect(screen.getByTestId('mock-route-card-car-1')).toBeInTheDocument();
    expect(
      screen.getByTestId('mock-route-card-emergency-0')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('mock-route-card-emergency-1')
    ).not.toBeInTheDocument();
  });

  it('should not render a profile group header for a single profile', () => {
    mockResults.byProfile = [{ profile: 'car', data: createMockRoute() }];

    render(<DirectionsControl />);

    expect(screen.queryByText('Car')).not.toBeInTheDocument();
  });

  it('should render a profile group header per profile when several profiles routed', () => {
    mockResults.byProfile = [
      { profile: 'car', data: createMockRoute() },
      { profile: 'emergency', data: createMockRoute() },
    ];

    render(<DirectionsControl />);

    expect(screen.getByText('Car')).toBeInTheDocument();
    expect(screen.getByText('Emergency')).toBeInTheDocument();
  });

  it('should mark only the active route as active', () => {
    mockResults.byProfile = [
      { profile: 'car', data: createMockRoute(['car-alt']) },
      { profile: 'emergency', data: createMockRoute() },
    ];
    mockActiveRoute = { profile: 'emergency', index: 0 };

    render(<DirectionsControl />);

    expect(screen.getByTestId('mock-route-card-emergency-0')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(screen.getByTestId('mock-route-card-car-0')).toHaveAttribute(
      'data-active',
      'false'
    );
    expect(screen.getByTestId('mock-route-card-car-1')).toHaveAttribute(
      'data-active',
      'false'
    );
  });

  it('should call setActiveRoute with profile and index when a card is selected', async () => {
    const user = userEvent.setup();
    mockResults.byProfile = [
      { profile: 'car', data: createMockRoute(['car-alt']) },
      { profile: 'emergency', data: createMockRoute() },
    ];

    render(<DirectionsControl />);

    await user.click(screen.getByTestId('mock-route-card-car-1'));
    expect(mockSetActiveRoute).toHaveBeenCalledWith({
      profile: 'car',
      index: 1,
    });

    await user.click(screen.getByTestId('mock-route-card-emergency-0'));
    expect(mockSetActiveRoute).toHaveBeenCalledWith({
      profile: 'emergency',
      index: 0,
    });
  });

  it('should sync waypoints to URL', () => {
    mockWaypoints.length = 0;
    mockWaypoints.push(
      {
        id: '0',
        geocodeResults: [
          { selected: true, sourcelnglat: [13.4, 52.5] },
        ] as never[],
        userInput: 'Berlin',
      },
      {
        id: '1',
        geocodeResults: [
          { selected: true, sourcelnglat: [10.0, 48.0] },
        ] as never[],
        userInput: 'Munich',
      }
    );

    render(<DirectionsControl />);

    expect(mockNavigate).toHaveBeenCalledWith({
      search: expect.any(Function),
      replace: true,
    });

    const navigateCall = mockNavigate.mock.calls[0]?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    const searchFn = navigateCall.search;
    const result = searchFn({});

    expect(result.wps).toBe('13.4,52.5,10,48');
  });
});

describe('DirectionsControl URL parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResults.byProfile = [];
    mockResults.show = {};
    mockActiveRoute = null;
    mockWaypoints.length = 0;
    mockWaypoints.push(
      { id: '0', geocodeResults: [], userInput: '' },
      { id: '1', geocodeResults: [], userInput: '' }
    );
  });

  it('should process URL params with valid coordinates (Berlin)', async () => {
    const parseUrlParams = await import('@/utils/parse-url-params');
    vi.mocked(parseUrlParams.parseUrlParams).mockReturnValue({
      wps: '13.365016850476763,52.483706198952575,13.422421655040836,52.49336042169804',
    });

    render(<DirectionsControl />);

    expect(mockSetWaypointFromCoords).toHaveBeenCalledTimes(2);
    expect(mockSetWaypointFromCoords).toHaveBeenCalledWith(
      13.365016850476763,
      52.483706198952575,
      0,
      { isPermalink: true }
    );
    expect(mockSetWaypointFromCoords).toHaveBeenCalledWith(
      13.422421655040836,
      52.49336042169804,
      1,
      { isPermalink: true }
    );
  });

  it('should process URL params with valid coordinates where lng > 90 (Singapore)', async () => {
    const parseUrlParams = await import('@/utils/parse-url-params');
    vi.mocked(parseUrlParams.parseUrlParams).mockReturnValue({
      wps: '103.66492937866911,1.4827280571964963,103.66421854954496,1.4840285187178779',
    });

    render(<DirectionsControl />);

    expect(mockSetWaypointFromCoords).toHaveBeenCalledTimes(2);
    expect(mockSetWaypointFromCoords).toHaveBeenCalledWith(
      103.66492937866911,
      1.4827280571964963,
      0,
      { isPermalink: true }
    );
    expect(mockSetWaypointFromCoords).toHaveBeenCalledWith(
      103.66421854954496,
      1.4840285187178779,
      1,
      { isPermalink: true }
    );
  });

  it('should skip truly invalid coordinates from URL', async () => {
    const parseUrlParams = await import('@/utils/parse-url-params');
    vi.mocked(parseUrlParams.parseUrlParams).mockReturnValue({
      wps: '999,999',
    });

    render(<DirectionsControl />);

    expect(mockSetWaypointFromCoords).not.toHaveBeenCalled();
  });

  it('should handle coordinates near edge of valid range', async () => {
    const parseUrlParams = await import('@/utils/parse-url-params');
    vi.mocked(parseUrlParams.parseUrlParams).mockReturnValue({
      wps: '179.9,89,-179.9,-89',
    });

    render(<DirectionsControl />);

    expect(mockSetWaypointFromCoords).toHaveBeenCalledTimes(2);
    expect(mockSetWaypointFromCoords).toHaveBeenCalledWith(179.9, 89, 0, {
      isPermalink: true,
    });
    expect(mockSetWaypointFromCoords).toHaveBeenCalledWith(-179.9, -89, 1, {
      isPermalink: true,
    });
  });
});
