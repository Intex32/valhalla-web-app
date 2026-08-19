import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IsochronesControl } from './isochrones';
import type { Profile } from '@/stores/common-store';
import { targetKey } from '@/utils/targets';

const mockNavigate = vi.fn();
const mockRefetchIsochrones = vi.fn();
const mockReverseGeocode = vi.fn().mockResolvedValue([]);
const mockFlyTo = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: vi.fn(() => mockNavigate),
}));

vi.mock('react-map-gl/maplibre', () => ({
  useMap: vi.fn(() => ({
    mainMap: {
      flyTo: mockFlyTo,
    },
  })),
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

// Only the store hook is faked: findInstance / instanceIndex stay real so the
// grouping under test is the code that ships.
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

interface MockTarget {
  instanceId: string;
  profile: Profile;
}

interface MockIsochroneData {
  features: { properties: { contour: number; area: number } }[];
}

interface MockFailure {
  target: MockTarget;
  kind: 'unsupported' | 'error';
  message: string;
}

const mockResults: {
  byTarget: { target: MockTarget; data: MockIsochroneData }[];
  failures: MockFailure[];
  show: Record<string, boolean>;
} = {
  byTarget: [],
  failures: [],
  show: {},
};

const mockGeocodeResults: {
  selected: boolean;
  sourcelnglat: [number, number];
}[] = [];

vi.mock('@/stores/isochrones-store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/stores/isochrones-store')>();

  const state = () => ({
    results: mockResults,
    geocodeResults: mockGeocodeResults,
  });

  return {
    ...actual,
    useIsochronesStore: Object.assign(
      vi.fn((selector) => selector(state())),
      { getState: state }
    ),
  };
});

vi.mock('@/hooks/use-isochrones-queries', () => ({
  useIsochronesQuery: vi.fn(() => ({
    refetch: mockRefetchIsochrones,
  })),
  useReverseGeocodeIsochrones: vi.fn(() => ({
    reverseGeocode: mockReverseGeocode,
  })),
}));

vi.mock('./waypoints', () => ({
  Waypoints: () => <div data-testid="mock-waypoints">Waypoints</div>,
}));

vi.mock('@/components/settings-footer', () => ({
  SettingsFooter: () => (
    <div data-testid="mock-settings-footer">Settings Footer</div>
  ),
}));

vi.mock('./isochrone-card', () => ({
  IsochroneCard: ({
    data,
    target,
    showOnMap,
    showProfileLabel,
  }: {
    data: unknown;
    target: MockTarget;
    showOnMap: boolean;
    showProfileLabel: boolean;
  }) => (
    <div
      data-testid="mock-isochrone-card"
      data-instance={target.instanceId}
      data-profile={target.profile}
      data-show-on-map={showOnMap}
      data-show-profile-label={showProfileLabel}
    >
      Isochrone Card: {JSON.stringify(data)}
    </div>
  ),
}));

vi.mock('./isochrone-visualization', () => ({
  IsochroneVisualization: ({
    multipleProfiles,
  }: {
    multipleProfiles: boolean;
  }) => (
    <div
      data-testid="mock-isochrone-visualization"
      data-multiple-profiles={multipleProfiles}
    >
      Isochrone Visualization
    </div>
  ),
}));

vi.mock('@/components/quick-settings', () => ({
  QuickSettings: (props: Record<string, unknown>) => (
    <div data-testid="mock-quick-settings" data-props={JSON.stringify(props)}>
      Quick Settings
    </div>
  ),
}));

const isochroneResult = (
  instanceId: string,
  profile: Profile,
  contour: number,
  area: number
) => ({
  target: { instanceId, profile },
  data: { features: [{ properties: { contour, area } }] },
});

const resetState = () => {
  vi.clearAllMocks();
  mockResults.byTarget = [];
  mockResults.failures = [];
  mockResults.show = {};
  mockInstances.length = 0;
  mockInstances.push(PUBLIC_INSTANCE, LOCAL_INSTANCE);
  mockGeocodeResults.length = 0;
};

describe('IsochronesControl', () => {
  beforeEach(resetState);

  it('should render without crashing', () => {
    expect(() => render(<IsochronesControl />)).not.toThrow();
  });

  it('should render Waypoints component', () => {
    render(<IsochronesControl />);
    expect(screen.getByTestId('mock-waypoints')).toBeInTheDocument();
  });

  it('should render SettingsFooter component', () => {
    render(<IsochronesControl />);
    expect(screen.getByTestId('mock-settings-footer')).toBeInTheDocument();
  });

  it('should not render IsochroneCard or instance groups when no results', () => {
    render(<IsochronesControl />);

    expect(screen.queryByTestId('mock-isochrone-card')).not.toBeInTheDocument();
    expect(screen.queryByText('Isochrones')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('instance-group-public')
    ).not.toBeInTheDocument();
  });

  it('should not render IsochroneVisualization when no results', () => {
    render(<IsochronesControl />);
    expect(
      screen.queryByTestId('mock-isochrone-visualization')
    ).not.toBeInTheDocument();
  });

  it('should render an IsochroneCard inside its instance group when results exist', () => {
    mockResults.byTarget = [isochroneResult('public', 'car', 10, 5.5)];

    render(<IsochronesControl />);

    expect(screen.getByText('Isochrones')).toBeInTheDocument();

    const group = screen.getByTestId('instance-group-public');
    expect(group).toContainElement(screen.getByTestId('mock-isochrone-card'));
    expect(
      screen.queryByTestId('instance-group-local')
    ).not.toBeInTheDocument();
  });

  it('should label the instance group with its label and url', () => {
    mockResults.byTarget = [isochroneResult('local', 'car', 10, 5.5)];

    render(<IsochronesControl />);

    const group = screen.getByTestId('instance-group-local');
    expect(group).toHaveTextContent('Local');
    expect(group).toHaveTextContent('http://localhost:8002');
  });

  it('should render IsochroneVisualization when results exist', () => {
    mockResults.byTarget = [isochroneResult('public', 'car', 10, 5.5)];

    render(<IsochronesControl />);

    const visualization = screen.getByTestId('mock-isochrone-visualization');
    expect(visualization).toBeInTheDocument();
    expect(visualization).toHaveAttribute('data-multiple-profiles', 'false');
  });

  it('should render one IsochroneCard per target', () => {
    mockResults.byTarget = [
      isochroneResult('public', 'car', 10, 5.5),
      isochroneResult('public', 'emergency', 10, 7.25),
    ];

    render(<IsochronesControl />);

    const cards = screen.getAllByTestId('mock-isochrone-card');
    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.getAttribute('data-profile'))).toEqual([
      'car',
      'emergency',
    ]);
  });

  it('should render the same profile on two instances as two cards in two groups', () => {
    mockResults.byTarget = [
      isochroneResult('public', 'car', 10, 5.5),
      isochroneResult('local', 'car', 10, 6.75),
    ];

    render(<IsochronesControl />);

    const cards = screen.getAllByTestId('mock-isochrone-card');
    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.getAttribute('data-instance'))).toEqual([
      'public',
      'local',
    ]);

    const [publicCard, localCard] = cards;
    expect(screen.getByTestId('instance-group-public')).toContainElement(
      publicCard ?? null
    );
    expect(screen.getByTestId('instance-group-local')).toContainElement(
      localCard ?? null
    );
  });

  it('should group results by instance in instance list order', () => {
    mockResults.byTarget = [
      isochroneResult('local', 'car', 10, 5.5),
      isochroneResult('public', 'bicycle', 10, 1.5),
    ];

    render(<IsochronesControl />);

    const groups = screen.getAllByTestId(/^instance-group-/);
    expect(groups.map((group) => group.dataset.testid)).toEqual([
      'instance-group-public',
      'instance-group-local',
    ]);
  });

  it('should skip results whose instance is no longer configured', () => {
    mockResults.byTarget = [
      isochroneResult('public', 'car', 10, 5.5),
      isochroneResult('deleted', 'car', 10, 5.5),
    ];

    render(<IsochronesControl />);

    const cards = screen.getAllByTestId('mock-isochrone-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute('data-instance', 'public');
    expect(
      screen.queryByTestId('instance-group-deleted')
    ).not.toBeInTheDocument();
  });

  it('should tell IsochroneVisualization when several targets are shown', () => {
    mockResults.byTarget = [
      isochroneResult('public', 'car', 10, 5.5),
      isochroneResult('local', 'car', 10, 7.25),
    ];

    render(<IsochronesControl />);

    expect(screen.getByTestId('mock-isochrone-visualization')).toHaveAttribute(
      'data-multiple-profiles',
      'true'
    );
  });

  it('should only label profiles on the cards when several targets are shown', () => {
    mockResults.byTarget = [isochroneResult('public', 'car', 10, 5.5)];

    const { unmount } = render(<IsochronesControl />);
    expect(screen.getByTestId('mock-isochrone-card')).toHaveAttribute(
      'data-show-profile-label',
      'false'
    );
    unmount();

    mockResults.byTarget = [
      isochroneResult('public', 'car', 10, 5.5),
      isochroneResult('public', 'bicycle', 10, 1.5),
    ];

    render(<IsochronesControl />);
    for (const card of screen.getAllByTestId('mock-isochrone-card')) {
      expect(card).toHaveAttribute('data-show-profile-label', 'true');
    }
  });

  it('should pass the per-target visibility flag to IsochroneCard', () => {
    mockResults.byTarget = [
      isochroneResult('public', 'car', 15, 8.2),
      isochroneResult('public', 'emergency', 15, 9.4),
    ];
    mockResults.show = {
      [targetKey({ instanceId: 'public', profile: 'car' })]: false,
      [targetKey({ instanceId: 'public', profile: 'emergency' })]: true,
    };

    render(<IsochronesControl />);

    const [carCard, emergencyCard] = screen.getAllByTestId(
      'mock-isochrone-card'
    );
    expect(carCard).toHaveAttribute('data-show-on-map', 'false');
    expect(emergencyCard).toHaveAttribute('data-show-on-map', 'true');
  });

  it('should key visibility per target, not per profile', () => {
    mockResults.byTarget = [
      isochroneResult('public', 'car', 15, 8.2),
      isochroneResult('local', 'car', 15, 9.4),
    ];
    mockResults.show = {
      [targetKey({ instanceId: 'public', profile: 'car' })]: false,
      [targetKey({ instanceId: 'local', profile: 'car' })]: true,
    };

    render(<IsochronesControl />);

    const [publicCard, localCard] = screen.getAllByTestId(
      'mock-isochrone-card'
    );
    expect(publicCard).toHaveAttribute('data-show-on-map', 'false');
    expect(localCard).toHaveAttribute('data-show-on-map', 'true');
  });

  it('should default a target to visible when it has no visibility flag', () => {
    mockResults.byTarget = [isochroneResult('public', 'car', 15, 8.2)];
    mockResults.show = {};

    render(<IsochronesControl />);

    expect(screen.getByTestId('mock-isochrone-card')).toHaveAttribute(
      'data-show-on-map',
      'true'
    );
  });

  it('should render the unsupported banner only in the failing instance group', () => {
    mockResults.byTarget = [
      isochroneResult('public', 'car', 10, 5.5),
      isochroneResult('local', 'car', 10, 6.75),
    ];
    mockResults.failures = [
      {
        target: { instanceId: 'local', profile: 'emergency' },
        kind: 'unsupported',
        message: 'No costing method found for emergency',
      },
    ];

    render(<IsochronesControl />);

    const banner = screen.getByTestId('unsupported-banner-local');
    expect(banner).toHaveTextContent('Emergency');
    expect(screen.getByTestId('instance-group-local')).toContainElement(banner);
    expect(
      screen.queryByTestId('unsupported-banner-public')
    ).not.toBeInTheDocument();
  });

  it('should render an instance group that only has failures', () => {
    mockResults.failures = [
      {
        target: { instanceId: 'public', profile: 'emergency' },
        kind: 'unsupported',
        message: 'No costing method found for emergency',
      },
    ];

    render(<IsochronesControl />);

    expect(screen.getByText('Isochrones')).toBeInTheDocument();
    expect(screen.getByTestId('instance-group-public')).toBeInTheDocument();
    expect(screen.getByTestId('unsupported-banner-public')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-isochrone-card')).not.toBeInTheDocument();
  });

  it('should sync geocode results to URL', () => {
    mockGeocodeResults.push({
      selected: true,
      sourcelnglat: [13.4, 52.5],
    });

    render(<IsochronesControl />);

    expect(mockNavigate).toHaveBeenCalledWith({
      search: expect.any(Function),
      replace: true,
    });
  });

  it('should call navigate with wps parameter when center exists', () => {
    mockGeocodeResults.push({
      selected: true,
      sourcelnglat: [13.4, 52.5],
    });

    render(<IsochronesControl />);

    expect(mockNavigate.mock.calls.length).toBeGreaterThan(0);
    const navigateCall = mockNavigate.mock.calls[0]?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    const searchFn = navigateCall.search;
    const searchParams = searchFn({});

    expect(searchParams.wps).toBe('13.4,52.5');
  });

  it('should call navigate with undefined wps when no center', () => {
    render(<IsochronesControl />);

    expect(mockNavigate.mock.calls.length).toBeGreaterThan(0);
    const navigateCall = mockNavigate.mock.calls[0]?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    const searchFn = navigateCall.search;
    const searchParams = searchFn({ wps: 'old-value' });

    expect(searchParams.wps).toBeUndefined();
  });

  it('should render QuickSettings without the language picker', () => {
    render(<IsochronesControl />);

    const quickSettings = screen.getByTestId('mock-quick-settings');
    expect(quickSettings).toBeInTheDocument();
    expect(quickSettings).toHaveAttribute(
      'data-props',
      JSON.stringify({ showLanguage: false })
    );
  });
});

describe('IsochronesControl URL parsing', () => {
  beforeEach(resetState);

  it('should process URL params with valid coordinates', async () => {
    const parseUrlParams = await import('@/utils/parse-url-params');
    vi.mocked(parseUrlParams.parseUrlParams).mockReturnValue({
      wps: '13.4,52.5',
    });

    render(<IsochronesControl />);

    expect(mockReverseGeocode).toHaveBeenCalledWith(13.4, 52.5);
    expect(mockFlyTo).toHaveBeenCalledWith({
      center: [13.4, 52.5],
      zoom: 12,
    });
  });

  it('should skip invalid coordinates from URL', async () => {
    const parseUrlParams = await import('@/utils/parse-url-params');
    vi.mocked(parseUrlParams.parseUrlParams).mockReturnValue({
      wps: '999,999',
    });

    render(<IsochronesControl />);

    expect(mockReverseGeocode).not.toHaveBeenCalled();
  });

  it('should process URL params with valid coordinates where lng > 90 (Singapore)', async () => {
    const parseUrlParams = await import('@/utils/parse-url-params');
    vi.mocked(parseUrlParams.parseUrlParams).mockReturnValue({
      wps: '103.66492937866911,1.4827280571964963',
    });

    render(<IsochronesControl />);

    expect(mockReverseGeocode).toHaveBeenCalledWith(
      103.66492937866911,
      1.4827280571964963
    );
    expect(mockFlyTo).toHaveBeenCalledWith({
      center: [103.66492937866911, 1.4827280571964963],
      zoom: 12,
    });
  });
});
