import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IsochronesControl } from './isochrones';
import type { Profile } from '@/stores/common-store';

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

interface MockIsochroneData {
  features: { properties: { contour: number; area: number } }[];
}

const mockResults: {
  byProfile: { profile: Profile; data: MockIsochroneData }[];
  show: Partial<Record<Profile, boolean>>;
} = {
  byProfile: [],
  show: {},
};

const mockGeocodeResults: {
  selected: boolean;
  sourcelnglat: [number, number];
}[] = [];

vi.mock('@/stores/isochrones-store', () => {
  const useIsochronesStore = Object.assign(
    vi.fn((selector) =>
      selector({
        results: mockResults,
        geocodeResults: mockGeocodeResults,
      })
    ),
    {
      getState: () => ({
        results: mockResults,
        geocodeResults: mockGeocodeResults,
      }),
    }
  );
  return { useIsochronesStore };
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
    profile,
    showOnMap,
    showProfileLabel,
  }: {
    data: unknown;
    profile: string;
    showOnMap: boolean;
    showProfileLabel: boolean;
  }) => (
    <div
      data-testid="mock-isochrone-card"
      data-profile={profile}
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
  QuickSettings: () => (
    <div data-testid="mock-quick-settings">Quick Settings</div>
  ),
}));

const isochroneResult = (profile: Profile, contour: number, area: number) => ({
  profile,
  data: { features: [{ properties: { contour, area } }] },
});

describe('IsochronesControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResults.byProfile = [];
    mockResults.show = {};
    mockGeocodeResults.length = 0;
  });

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

  it('should not render IsochroneCard when no results', () => {
    render(<IsochronesControl />);
    expect(screen.queryByTestId('mock-isochrone-card')).not.toBeInTheDocument();
    expect(screen.queryByText('Isochrones')).not.toBeInTheDocument();
  });

  it('should not render IsochroneVisualization when no results', () => {
    render(<IsochronesControl />);
    expect(
      screen.queryByTestId('mock-isochrone-visualization')
    ).not.toBeInTheDocument();
  });

  it('should render IsochroneCard when results exist', () => {
    mockResults.byProfile = [isochroneResult('car', 10, 5.5)];

    render(<IsochronesControl />);

    expect(screen.getByText('Isochrones')).toBeInTheDocument();
    expect(screen.getByTestId('mock-isochrone-card')).toBeInTheDocument();
  });

  it('should render IsochroneVisualization when results exist', () => {
    mockResults.byProfile = [isochroneResult('car', 10, 5.5)];

    render(<IsochronesControl />);

    const visualization = screen.getByTestId('mock-isochrone-visualization');
    expect(visualization).toBeInTheDocument();
    expect(visualization).toHaveAttribute('data-multiple-profiles', 'false');
  });

  it('should render one IsochroneCard per profile', () => {
    mockResults.byProfile = [
      isochroneResult('car', 10, 5.5),
      isochroneResult('emergency', 10, 7.25),
    ];

    render(<IsochronesControl />);

    const cards = screen.getAllByTestId('mock-isochrone-card');
    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.getAttribute('data-profile'))).toEqual([
      'car',
      'emergency',
    ]);
  });

  it('should tell IsochroneVisualization when several profiles are shown', () => {
    mockResults.byProfile = [
      isochroneResult('car', 10, 5.5),
      isochroneResult('emergency', 10, 7.25),
    ];

    render(<IsochronesControl />);

    expect(screen.getByTestId('mock-isochrone-visualization')).toHaveAttribute(
      'data-multiple-profiles',
      'true'
    );
  });

  it('should only label profiles on the cards when several profiles are shown', () => {
    mockResults.byProfile = [isochroneResult('car', 10, 5.5)];

    const { unmount } = render(<IsochronesControl />);
    expect(screen.getByTestId('mock-isochrone-card')).toHaveAttribute(
      'data-show-profile-label',
      'false'
    );
    unmount();

    mockResults.byProfile = [
      isochroneResult('car', 10, 5.5),
      isochroneResult('bicycle', 10, 1.5),
    ];

    render(<IsochronesControl />);
    for (const card of screen.getAllByTestId('mock-isochrone-card')) {
      expect(card).toHaveAttribute('data-show-profile-label', 'true');
    }
  });

  it('should pass the per-profile visibility flag to IsochroneCard', () => {
    mockResults.byProfile = [
      isochroneResult('car', 15, 8.2),
      isochroneResult('emergency', 15, 9.4),
    ];
    mockResults.show = { car: false, emergency: true };

    render(<IsochronesControl />);

    const [carCard, emergencyCard] = screen.getAllByTestId(
      'mock-isochrone-card'
    );
    expect(carCard).toHaveAttribute('data-show-on-map', 'false');
    expect(emergencyCard).toHaveAttribute('data-show-on-map', 'true');
  });

  it('should default a profile to visible when it has no visibility flag', () => {
    mockResults.byProfile = [isochroneResult('car', 15, 8.2)];
    mockResults.show = {};

    render(<IsochronesControl />);

    expect(screen.getByTestId('mock-isochrone-card')).toHaveAttribute(
      'data-show-on-map',
      'true'
    );
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
    const result = searchFn({});

    expect(result.wps).toBe('13.4,52.5');
  });

  it('should call navigate with undefined wps when no center', () => {
    render(<IsochronesControl />);

    expect(mockNavigate.mock.calls.length).toBeGreaterThan(0);
    const navigateCall = mockNavigate.mock.calls[0]?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    const searchFn = navigateCall.search;
    const result = searchFn({ wps: 'old-value' });

    expect(result.wps).toBeUndefined();
  });

  it('should render QuickSettings component', () => {
    render(<IsochronesControl />);
    expect(screen.getByTestId('mock-quick-settings')).toBeInTheDocument();
  });
});

describe('IsochronesControl URL parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResults.byProfile = [];
    mockResults.show = {};
    mockGeocodeResults.length = 0;
  });

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
