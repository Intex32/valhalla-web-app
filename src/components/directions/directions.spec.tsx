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

const PUBLIC_INSTANCE = {
  id: 'public',
  label: 'Public',
  url: 'https://valhalla1.openstreetmap.de',
};
const LOCAL_INSTANCE = {
  id: 'local',
  label: 'Local',
  url: 'http://localhost:8002',
};

const mockInstances = [PUBLIC_INSTANCE, LOCAL_INSTANCE];

// Only the store hook is faked: instanceIndex / findInstance stay real so the
// grouping and colouring under test is the code that ships.
vi.mock('@/stores/instances-store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/stores/instances-store')>();
  const state = () => ({ instances: mockInstances });

  return {
    ...actual,
    useInstancesStore: Object.assign(
      vi.fn((selector) => selector(state())),
      { getState: state }
    ),
  };
});

const mockWaypoints = [
  { id: '0', geocodeResults: [], userInput: '' },
  { id: '1', geocodeResults: [], userInput: '' },
];

interface MockTarget {
  instanceId: string;
  profile: string;
}

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

const routeResult = (
  instanceId: string,
  profile: string,
  alternateIds: string[] = []
) => ({
  target: { instanceId, profile },
  data: createMockRoute(alternateIds),
});

interface MockFailure {
  target: MockTarget;
  kind: 'unsupported' | 'error';
  message: string;
}

const mockResults = {
  byTarget: [] as { target: MockTarget; data: MockRoute }[],
  failures: [] as MockFailure[],
  show: {} as Record<string, boolean>,
};

let mockActiveRoute: (MockTarget & { index: number }) | null = null;

vi.mock('@/stores/directions-store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/stores/directions-store')>();

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

  return {
    ...actual,
    useDirectionsStore: Object.assign(
      vi.fn((selector) => selector(state())),
      { getState: state }
    ),
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

vi.mock('@/components/directions/export-waypoints-button', () => ({
  ExportWaypointsButton: () => (
    <div data-testid="mock-export-waypoints-button">Export Waypoints</div>
  ),
}));

vi.mock('./route-card', () => ({
  RouteCard: ({
    data,
    target,
    index,
    isActive,
    onSelect,
  }: {
    data: unknown;
    target: MockTarget;
    index: number;
    isActive: boolean;
    onSelect: () => void;
  }) => (
    <div
      data-testid={`mock-route-card-${target.instanceId}-${target.profile}-${index.toString()}`}
      data-instance={target.instanceId}
      data-profile={target.profile}
      data-index={index}
      data-active={isActive}
      onClick={onSelect}
    >
      Route Card {target.instanceId} {target.profile} {index}:{' '}
      {JSON.stringify(data)}
    </div>
  ),
}));

const resetState = () => {
  vi.clearAllMocks();
  mockResults.byTarget = [];
  mockResults.failures = [];
  mockResults.show = {};
  mockActiveRoute = null;
  mockInstances.length = 0;
  mockInstances.push(PUBLIC_INSTANCE, LOCAL_INSTANCE);
  mockWaypoints.length = 0;
  mockWaypoints.push(
    { id: '0', geocodeResults: [], userInput: '' },
    { id: '1', geocodeResults: [], userInput: '' }
  );
};

describe('DirectionsControl', () => {
  beforeEach(resetState);

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

  it('should render the export waypoints button', () => {
    render(<DirectionsControl />);
    expect(
      screen.getByTestId('mock-export-waypoints-button')
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

  it('should not render RouteCard or instance groups when no results', () => {
    render(<DirectionsControl />);

    expect(
      screen.queryByTestId('mock-route-card-public-car-0')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Directions')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('instance-group-public')
    ).not.toBeInTheDocument();
  });

  it('should render a RouteCard inside its instance group when results exist', () => {
    mockResults.byTarget = [routeResult('public', 'car')];

    render(<DirectionsControl />);

    expect(screen.getByText('Directions')).toBeInTheDocument();

    const group = screen.getByTestId('instance-group-public');
    expect(group).toBeInTheDocument();
    expect(
      screen.getByTestId('mock-route-card-public-car-0')
    ).toBeInTheDocument();
    expect(group).toContainElement(
      screen.getByTestId('mock-route-card-public-car-0')
    );
    expect(
      screen.queryByTestId('instance-group-local')
    ).not.toBeInTheDocument();
  });

  it('should label the instance group with its label and url', () => {
    mockResults.byTarget = [routeResult('local', 'car')];

    render(<DirectionsControl />);

    const group = screen.getByTestId('instance-group-local');
    expect(group).toHaveTextContent('Local');
    expect(group).toHaveTextContent('http://localhost:8002');
  });

  it('should render alternate routes when available', () => {
    mockResults.byTarget = [routeResult('public', 'car', ['alt-1', 'alt-2'])];

    render(<DirectionsControl />);

    expect(
      screen.getByTestId('mock-route-card-public-car-0')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('mock-route-card-public-car-1')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('mock-route-card-public-car-2')
    ).toBeInTheDocument();
  });

  it('should render one card per target when several profiles routed on one instance', () => {
    mockResults.byTarget = [
      routeResult('public', 'car', ['car-alt']),
      routeResult('public', 'emergency'),
    ];

    render(<DirectionsControl />);

    expect(
      screen.getByTestId('mock-route-card-public-car-0')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('mock-route-card-public-car-1')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('mock-route-card-public-emergency-0')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('mock-route-card-public-emergency-1')
    ).not.toBeInTheDocument();
  });

  it('should render the same profile on two instances as two cards in two groups', () => {
    mockResults.byTarget = [
      routeResult('public', 'car'),
      routeResult('local', 'car'),
    ];

    render(<DirectionsControl />);

    const publicGroup = screen.getByTestId('instance-group-public');
    const localGroup = screen.getByTestId('instance-group-local');

    const publicCard = screen.getByTestId('mock-route-card-public-car-0');
    const localCard = screen.getByTestId('mock-route-card-local-car-0');

    expect(publicGroup).toContainElement(publicCard);
    expect(localGroup).toContainElement(localCard);
    expect(publicCard).not.toBe(localCard);
    expect(screen.getAllByText('Car')).toHaveLength(2);
  });

  it('should group results by instance in instance list order', () => {
    mockResults.byTarget = [
      routeResult('local', 'car'),
      routeResult('public', 'bicycle'),
    ];

    render(<DirectionsControl />);

    const groups = screen.getAllByTestId(/^instance-group-/);
    expect(groups.map((group) => group.dataset.testid)).toEqual([
      'instance-group-public',
      'instance-group-local',
    ]);
  });

  it('should skip results whose instance is no longer configured', () => {
    mockResults.byTarget = [
      routeResult('public', 'car'),
      routeResult('deleted', 'car'),
    ];

    render(<DirectionsControl />);

    expect(
      screen.getByTestId('mock-route-card-public-car-0')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('mock-route-card-deleted-car-0')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('instance-group-deleted')
    ).not.toBeInTheDocument();
  });

  it('should label every target card with its profile', () => {
    mockResults.byTarget = [
      routeResult('public', 'car'),
      routeResult('public', 'emergency'),
    ];

    render(<DirectionsControl />);

    expect(screen.getByText('Car')).toBeInTheDocument();
    expect(screen.getByText('Emergency')).toBeInTheDocument();
  });

  it('should render the unsupported banner only in the failing instance group', () => {
    mockResults.byTarget = [
      routeResult('public', 'car'),
      routeResult('local', 'car'),
    ];
    mockResults.failures = [
      {
        target: { instanceId: 'public', profile: 'emergency' },
        kind: 'unsupported',
        message: 'No costing method found for emergency',
      },
    ];

    render(<DirectionsControl />);

    const banner = screen.getByTestId('unsupported-banner-public');
    expect(banner).toHaveTextContent('Emergency');
    expect(screen.getByTestId('instance-group-public')).toContainElement(
      banner
    );
    expect(
      screen.queryByTestId('unsupported-banner-local')
    ).not.toBeInTheDocument();
  });

  it('should not render a banner for a plain error failure', () => {
    mockResults.byTarget = [routeResult('public', 'car')];
    mockResults.failures = [
      {
        target: { instanceId: 'public', profile: 'car' },
        kind: 'error',
        message: 'Network error',
      },
    ];

    render(<DirectionsControl />);

    expect(
      screen.queryByTestId('unsupported-banner-public')
    ).not.toBeInTheDocument();
  });

  it('should render an instance group that only has failures', () => {
    mockResults.failures = [
      {
        target: { instanceId: 'local', profile: 'emergency' },
        kind: 'unsupported',
        message: 'No costing method found for emergency',
      },
    ];

    render(<DirectionsControl />);

    expect(screen.getByText('Directions')).toBeInTheDocument();
    expect(screen.getByTestId('instance-group-local')).toBeInTheDocument();
    expect(screen.getByTestId('unsupported-banner-local')).toBeInTheDocument();
  });

  it('should mark only the active route as active', () => {
    mockResults.byTarget = [
      routeResult('public', 'car', ['car-alt']),
      routeResult('public', 'emergency'),
    ];
    mockActiveRoute = { instanceId: 'public', profile: 'emergency', index: 0 };

    render(<DirectionsControl />);

    expect(
      screen.getByTestId('mock-route-card-public-emergency-0')
    ).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('mock-route-card-public-car-0')).toHaveAttribute(
      'data-active',
      'false'
    );
    expect(screen.getByTestId('mock-route-card-public-car-1')).toHaveAttribute(
      'data-active',
      'false'
    );
  });

  it('should not treat the same profile on another instance as the active route', () => {
    mockResults.byTarget = [
      routeResult('public', 'car'),
      routeResult('local', 'car'),
    ];
    mockActiveRoute = { instanceId: 'local', profile: 'car', index: 0 };

    render(<DirectionsControl />);

    expect(screen.getByTestId('mock-route-card-local-car-0')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(screen.getByTestId('mock-route-card-public-car-0')).toHaveAttribute(
      'data-active',
      'false'
    );
  });

  it('should call setActiveRoute with the target and index when a card is selected', async () => {
    const user = userEvent.setup();
    mockResults.byTarget = [
      routeResult('public', 'car', ['car-alt']),
      routeResult('local', 'emergency'),
    ];

    render(<DirectionsControl />);

    await user.click(screen.getByTestId('mock-route-card-public-car-1'));
    expect(mockSetActiveRoute).toHaveBeenCalledWith({
      instanceId: 'public',
      profile: 'car',
      index: 1,
    });

    await user.click(screen.getByTestId('mock-route-card-local-emergency-0'));
    expect(mockSetActiveRoute).toHaveBeenCalledWith({
      instanceId: 'local',
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
    const searchParams = searchFn({});

    expect(searchParams.wps).toBe('13.4,52.5,10,48');
  });
});

describe('DirectionsControl URL parsing', () => {
  beforeEach(resetState);

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
