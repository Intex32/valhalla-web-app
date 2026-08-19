import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuery } from '@tanstack/react-query';
import type { ValhallaInstance } from '@/stores/instances-store';
import { RoutePlanner } from './route-planner';

const mockToggleDirections = vi.fn();
const mockRefetchDirections = vi.fn();
const mockRefetchIsochrones = vi.fn();
const mockNavigate = vi.fn();

const PUBLIC_INSTANCE: ValhallaInstance = {
  id: 'public',
  label: 'Public',
  url: 'https://valhalla1.openstreetmap.de',
};
const LOCAL_INSTANCE: ValhallaInstance = {
  id: 'local',
  label: 'Local',
  url: 'http://localhost:8002',
};

/** Mutated per test — the tileset date belongs to `instances[0]`. */
let instances: ValhallaInstance[] = [PUBLIC_INSTANCE, LOCAL_INSTANCE];

vi.mock('@tanstack/react-router', () => ({
  useParams: vi.fn(() => ({ activeTab: 'directions' })),
  useNavigate: vi.fn(() => mockNavigate),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: new Date('2024-01-15T10:30:00'),
    isLoading: false,
    isError: false,
  })),
}));

vi.mock('@/stores/common-store', () => ({
  useCommonStore: vi.fn((selector) =>
    selector({
      directionsPanelOpen: true,
      loading: false,
      toggleDirections: mockToggleDirections,
    })
  ),
}));

// Only the hook is stubbed; the module's helpers stay real.
vi.mock('@/stores/instances-store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/stores/instances-store')>();

  return {
    ...actual,
    useInstancesStore: Object.assign(
      vi.fn((selector: (state: unknown) => unknown) => selector({ instances })),
      { getState: () => ({ instances }) }
    ),
  };
});

vi.mock('@/hooks/use-directions-queries', () => ({
  useDirectionsQuery: vi.fn(() => ({
    refetch: mockRefetchDirections,
  })),
}));

vi.mock('@/hooks/use-isochrones-queries', () => ({
  useIsochronesQuery: vi.fn(() => ({
    refetch: mockRefetchIsochrones,
  })),
}));

vi.mock('./directions/directions', () => ({
  DirectionsControl: vi.fn(() => (
    <div data-testid="mock-directions-control">Directions Control</div>
  )),
}));

vi.mock('./isochrones/isochrones', () => ({
  IsochronesControl: vi.fn(() => (
    <div data-testid="mock-isochrones-control">Isochrones Control</div>
  )),
}));

vi.mock('./tiles/tiles', () => ({
  TilesControl: vi.fn(() => (
    <div data-testid="mock-tiles-control">Tiles Control</div>
  )),
}));

vi.mock('./profile-picker', () => ({
  ProfilePicker: vi.fn(
    ({
      onTargetsChange,
    }: {
      onTargetsChange: (targets: unknown[]) => void;
    }) => (
      <div data-testid="mock-profile-picker">
        <button
          onClick={() => {
            onTargetsChange([{ instanceId: 'public', profile: 'car' }]);
          }}
        >
          Change to Car
        </button>
        <button
          onClick={() => {
            onTargetsChange([
              { instanceId: 'public', profile: 'car' },
              { instanceId: 'local', profile: 'car' },
            ]);
          }}
        >
          Compare Car on both
        </button>
      </div>
    )
  ),
}));

describe('RoutePlanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    instances = [PUBLIC_INSTANCE, LOCAL_INSTANCE];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render without crashing', () => {
    expect(() => render(<RoutePlanner />)).not.toThrow();
  });

  it('should render tab buttons', () => {
    render(<RoutePlanner />);
    expect(screen.getByTestId('directions-tab-button')).toBeInTheDocument();
    expect(screen.getByTestId('isochrones-tab-button')).toBeInTheDocument();
    expect(screen.getByTestId('tiles-tab-button')).toBeInTheDocument();
  });

  it('should render close button', () => {
    render(<RoutePlanner />);
    expect(screen.getByTestId('close-directions-button')).toBeInTheDocument();
  });

  it('should call toggleDirections when close button is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RoutePlanner />);

    await user.click(screen.getByTestId('close-directions-button'));

    expect(mockToggleDirections).toHaveBeenCalled();
  });

  it('should render ProfilePicker', () => {
    render(<RoutePlanner />);
    expect(screen.getByTestId('mock-profile-picker')).toBeInTheDocument();
  });

  it('should render DirectionsControl when on directions tab', () => {
    render(<RoutePlanner />);
    expect(screen.getByTestId('mock-directions-control')).toBeInTheDocument();
  });

  it('should navigate when tab is changed', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RoutePlanner />);

    await user.click(screen.getByTestId('isochrones-tab-button'));

    expect(mockNavigate).toHaveBeenCalledWith({
      params: { activeTab: 'isochrones' },
    });
  });

  it('should navigate and refetch when the selected targets change', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RoutePlanner />);

    await user.click(screen.getByText('Change to Car'));

    expect(mockNavigate).toHaveBeenCalledWith({
      search: expect.any(Function),
      replace: true,
    });
    expect(mockRefetchDirections).toHaveBeenCalled();
  });

  it('should write instance-qualified targets into the profile search param', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RoutePlanner />);

    await user.click(screen.getByText('Change to Car'));

    const { search } = vi.mocked(mockNavigate).mock.calls.at(-1)?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(search({ style: 'streets' })).toEqual({
      style: 'streets',
      profile: 'public:car',
    });
  });

  it('should keep the same profile on two instances apart in the URL', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RoutePlanner />);

    await user.click(screen.getByText('Compare Car on both'));

    const { search } = vi.mocked(mockNavigate).mock.calls.at(-1)?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(search({})).toEqual({ profile: 'public:car,local:car' });
  });

  it('should key the tileset date query by the first instance', () => {
    render(<RoutePlanner />);

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['lastUpdate', 'public'] })
    );
  });

  it('should re-key the tileset date query when another instance leads', () => {
    instances = [LOCAL_INSTANCE, PUBLIC_INSTANCE];
    render(<RoutePlanner />);

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['lastUpdate', 'local'] })
    );
  });

  it('should refetch isochrones after delay when targets change on directions tab', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RoutePlanner />);

    await user.click(screen.getByText('Change to Car'));

    expect(mockRefetchIsochrones).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(mockRefetchIsochrones).toHaveBeenCalled();
    });
  });

  it('should display last update date when loaded', () => {
    render(<RoutePlanner />);
    expect(screen.getByText(/Last Data Update:/)).toBeInTheDocument();
    expect(screen.getByText(/2024-01-15/)).toBeInTheDocument();
  });

  it('should navigate to tiles tab when tiles tab button is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RoutePlanner />);

    await user.click(screen.getByTestId('tiles-tab-button'));

    expect(mockNavigate).toHaveBeenCalledWith({
      params: { activeTab: 'tiles' },
    });
  });

  describe('when on tiles tab', () => {
    beforeEach(async () => {
      const router = await import('@tanstack/react-router');
      vi.mocked(router.useParams).mockReturnValue({ activeTab: 'tiles' });
    });

    it('should not render ProfilePicker on tiles tab', () => {
      render(<RoutePlanner />);
      expect(
        screen.queryByTestId('mock-profile-picker')
      ).not.toBeInTheDocument();
    });

    it('should not display last update date on tiles tab', () => {
      render(<RoutePlanner />);
      expect(screen.queryByText(/Last Data Update:/)).not.toBeInTheDocument();
    });
  });
});
