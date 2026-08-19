import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ScopedSettings } from '@/stores/common-store';
import type { ValhallaInstance } from '@/stores/instances-store';
import { SettingsPanel } from './settings-panel';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

const renderWithQueryClient = (ui: React.ReactElement) => {
  const testQueryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={testQueryClient}>{ui}</QueryClientProvider>
  );
};

const mockUpdateTargetSetting = vi.fn();
const mockSetTargetEnabled = vi.fn();
const mockSetUseGeocoding = vi.fn();
const mockResetSettings = vi.fn();
const mockToggleSettings = vi.fn();
const mockRefetchDirections = vi.fn();
const mockRefetchIsochrones = vi.fn();

const mockUseParams = vi.fn(() => ({ activeTab: 'directions' }));
const mockUseSearch = vi.fn(() => ({ profile: 'public:bicycle' }));

vi.mock('@tanstack/react-router', () => ({
  useParams: () => mockUseParams(),
  useSearch: () => mockUseSearch(),
}));

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

/** Mutated per test — the panel renders one section per selected target. */
let instances: ValhallaInstance[] = [PUBLIC_INSTANCE, LOCAL_INSTANCE];

/**
 * Scopes the user has actually touched, keyed by targetKey. A target missing
 * from here falls through to the store's own seed, which is how a freshly
 * opened panel looks: every option present but unticked.
 */
const perTarget: Record<string, ScopedSettings> = {};

const targetRef = (instanceId: string, profile: string) => ({
  instanceId,
  profile,
});

// Only `useCommonStore` is stubbed — getTargetScope and the seeds stay real so
// the panel renders the same values it would in the app.
vi.mock('@/stores/common-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/common-store')>();

  return {
    ...actual,
    useCommonStore: vi.fn((selector: (state: unknown) => unknown) =>
      selector({
        perTarget,
        excludePolygons: [],
        useGeocoding: true,
        settingsPanelOpen: true,
        updateTargetSetting: mockUpdateTargetSetting,
        setTargetEnabled: mockSetTargetEnabled,
        setUseGeocoding: mockSetUseGeocoding,
        resetSettings: mockResetSettings,
        toggleSettings: mockToggleSettings,
      })
    ),
  };
});

// instanceIndex / findInstance stay real — the section colours depend on them.
vi.mock('@/stores/instances-store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/stores/instances-store')>();

  return {
    ...actual,
    useInstancesStore: Object.assign(
      vi.fn((selector: (state: unknown) => unknown) =>
        selector({
          instances,
          addInstance: vi.fn(),
          updateInstance: vi.fn(),
          removeInstance: vi.fn(),
        })
      ),
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

/** Marks options as opted-in for a target without touching its values. */
const enableFor = async (targetKeyString: string, params: string[]) => {
  const { settingsInit } = await import('./settings-options');
  perTarget[targetKeyString] = {
    values: { ...settingsInit, alternates: 0 },
    enabled: Object.fromEntries(params.map((param) => [param, true])),
  };
};

describe('SettingsPanel', () => {
  const originalNavigator = global.navigator;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    for (const key of Object.keys(perTarget)) delete perTarget[key];
    instances = [PUBLIC_INSTANCE, LOCAL_INSTANCE];
    mockUseParams.mockReturnValue({ activeTab: 'directions' });
    mockUseSearch.mockReturnValue({ profile: 'public:bicycle' });
    vi.stubGlobal('navigator', { ...originalNavigator, language: 'en-US' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.stubGlobal('navigator', originalNavigator);
  });

  it('should render without crashing', () => {
    expect(() => renderWithQueryClient(<SettingsPanel />)).not.toThrow();
  });

  it('should render the settings title', () => {
    renderWithQueryClient(<SettingsPanel />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('should render close button', () => {
    renderWithQueryClient(<SettingsPanel />);
    expect(screen.getByTestId('close-settings-button')).toBeInTheDocument();
  });

  it('should call toggleSettings when close button is clicked', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPanel />);

    await user.click(screen.getByTestId('close-settings-button'));

    expect(mockToggleSettings).toHaveBeenCalled();
  });

  it('should title the section with the instance and the profile', () => {
    renderWithQueryClient(<SettingsPanel />);
    expect(screen.getByText('Public · Bicycle')).toBeInTheDocument();
  });

  it('should not render a shared section any more', () => {
    renderWithQueryClient(<SettingsPanel />);
    expect(screen.queryByText('Shared settings')).not.toBeInTheDocument();
  });

  it('should render one section per selected target', () => {
    mockUseSearch.mockReturnValue({ profile: 'public:car,public:emergency' });
    renderWithQueryClient(<SettingsPanel />);

    expect(screen.getByText('Public · Car')).toBeInTheDocument();
    expect(screen.getByText('Public · Emergency')).toBeInTheDocument();
    expect(screen.queryByText('Public · Bicycle')).not.toBeInTheDocument();
  });

  it('should give the same profile on two instances a section each', () => {
    mockUseSearch.mockReturnValue({ profile: 'public:car,local:car' });
    renderWithQueryClient(<SettingsPanel />);

    expect(screen.getByText('Public · Car')).toBeInTheDocument();
    expect(screen.getByText('Local · Car')).toBeInTheDocument();
  });

  it('should tag each target section so it can be styled per target', () => {
    mockUseSearch.mockReturnValue({ profile: 'public:car,local:car' });
    renderWithQueryClient(<SettingsPanel />);

    expect(
      screen.getByTestId('target-settings-public__car')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('target-settings-local__car')
    ).toBeInTheDocument();
  });

  it('should drop a target whose instance has been removed', () => {
    instances = [PUBLIC_INSTANCE];
    mockUseSearch.mockReturnValue({ profile: 'public:car,local:car' });
    renderWithQueryClient(<SettingsPanel />);

    expect(
      screen.getByTestId('target-settings-public__car')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('target-settings-local__car')
    ).not.toBeInTheDocument();
  });

  it('should explain that unticked options fall back to the server', () => {
    renderWithQueryClient(<SettingsPanel />);
    expect(
      screen.getByText(/Only ticked options are sent/i)
    ).toBeInTheDocument();
  });

  it('should render Copy to Clipboard button', () => {
    renderWithQueryClient(<SettingsPanel />);
    expect(
      screen.getByRole('button', { name: /Copy to Clipboard/i })
    ).toBeInTheDocument();
  });

  it('should render Reset button', () => {
    renderWithQueryClient(<SettingsPanel />);
    expect(
      screen.getByRole('button', { name: /^Reset$/i })
    ).toBeInTheDocument();
  });

  it("should render a profile's own options in its target section", () => {
    renderWithQueryClient(<SettingsPanel />);

    expect(screen.getByText('Cycling Speed')).toBeInTheDocument();
    expect(screen.getByText('Use Roads')).toBeInTheDocument();
    expect(screen.getByText('Use Hills')).toBeInTheDocument();
    expect(screen.getByText('Avoid Bad Surface')).toBeInTheDocument();
    expect(screen.getByText('Shortest')).toBeInTheDocument();
    expect(screen.getByText('Bicycle Type')).toBeInTheDocument();
  });

  it("should render the profile's general options in the same section", () => {
    renderWithQueryClient(<SettingsPanel />);

    expect(screen.getByText('Use Living Streets')).toBeInTheDocument();
    expect(screen.getByText('Use Ferries')).toBeInTheDocument();
    expect(screen.getByText('Service Penalty')).toBeInTheDocument();
  });

  it('should offer the turn penalty exactly once per target', () => {
    renderWithQueryClient(<SettingsPanel />);

    // maneuver_penalty is a general option; it used to be shadowed by a
    // per-profile duplicate labelled "Maneuver Penalty" and vanish entirely.
    expect(screen.getByText('Turn Penalty')).toBeInTheDocument();
    expect(
      screen.getAllByTestId('include-public__bicycle-maneuver_penalty')
    ).toHaveLength(1);
    expect(screen.queryByText('Maneuver Penalty')).not.toBeInTheDocument();
  });

  it('should give every selected target its own turn penalty checkbox', () => {
    mockUseSearch.mockReturnValue({ profile: 'public:car,public:emergency' });
    renderWithQueryClient(<SettingsPanel />);

    expect(
      screen.getByTestId('include-public__car-maneuver_penalty')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('include-public__emergency-maneuver_penalty')
    ).toBeInTheDocument();
  });

  it('should render an include checkbox for every costing option', () => {
    renderWithQueryClient(<SettingsPanel />);

    expect(
      screen.getByTestId('include-public__bicycle-cycling_speed')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('include-public__bicycle-shortest')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('include-public__bicycle-bicycle_type')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('include-public__bicycle-use_ferry')
    ).toBeInTheDocument();
  });

  it('should leave request-level params out of the checkbox list', () => {
    renderWithQueryClient(<SettingsPanel />);
    expect(
      screen.queryByTestId('include-public__bicycle-alternates')
    ).not.toBeInTheDocument();
  });

  it('should give each target its own alternates slider', () => {
    mockUseSearch.mockReturnValue({ profile: 'public:car,local:car' });
    renderWithQueryClient(<SettingsPanel />);

    expect(screen.getAllByText('Alternative routes')).toHaveLength(2);
    expect(document.getElementById('alternates-public__car')).not.toBeNull();
    expect(document.getElementById('alternates-local__car')).not.toBeNull();
  });

  it('should start every option unticked so the server defaults apply', () => {
    renderWithQueryClient(<SettingsPanel />);
    expect(
      screen.getByTestId('include-public__bicycle-cycling_speed')
    ).not.toBeChecked();
    expect(
      screen.getByTestId('include-public__bicycle-use_ferry')
    ).not.toBeChecked();
  });

  it("should opt a profile's own option in when its checkbox is ticked", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPanel />);

    await user.click(
      screen.getByTestId('include-public__bicycle-cycling_speed')
    );

    expect(mockSetTargetEnabled).toHaveBeenCalledWith(
      targetRef('public', 'bicycle'),
      'cycling_speed',
      true
    );
    expect(mockRefetchDirections).toHaveBeenCalled();
  });

  it('should opt a general option in when its checkbox is ticked', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPanel />);

    await user.click(screen.getByTestId('include-public__bicycle-use_ferry'));

    expect(mockSetTargetEnabled).toHaveBeenCalledWith(
      targetRef('public', 'bicycle'),
      'use_ferry',
      true
    );
    expect(mockRefetchDirections).toHaveBeenCalled();
  });

  it('should opt an option back out when its checkbox is unticked', async () => {
    const user = userEvent.setup();
    await enableFor('public__bicycle', ['cycling_speed']);
    renderWithQueryClient(<SettingsPanel />);

    expect(
      screen.getByTestId('include-public__bicycle-cycling_speed')
    ).toBeChecked();
    await user.click(
      screen.getByTestId('include-public__bicycle-cycling_speed')
    );

    expect(mockSetTargetEnabled).toHaveBeenCalledWith(
      targetRef('public', 'bicycle'),
      'cycling_speed',
      false
    );
  });

  it('should route a value edit to the target that owns the control', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPanel />);

    await user.click(screen.getByRole('checkbox', { name: 'Shortest' }));

    expect(mockUpdateTargetSetting).toHaveBeenCalledWith(
      targetRef('public', 'bicycle'),
      'shortest',
      true
    );
    expect(mockRefetchDirections).toHaveBeenCalled();
  });

  it('should keep each target section independent when several are selected', () => {
    mockUseSearch.mockReturnValue({ profile: 'public:car,public:truck' });
    renderWithQueryClient(<SettingsPanel />);

    // Both expose Width, so the checkbox ids must not collide across sections.
    expect(screen.getByTestId('include-public__car-width')).toBeInTheDocument();
    expect(
      screen.getByTestId('include-public__truck-width')
    ).toBeInTheDocument();
  });

  it('should not let the same profile on two instances share a checkbox', () => {
    mockUseSearch.mockReturnValue({ profile: 'public:car,local:car' });
    renderWithQueryClient(<SettingsPanel />);

    expect(screen.getByTestId('include-public__car-width')).toBeInTheDocument();
    expect(screen.getByTestId('include-local__car-width')).toBeInTheDocument();
  });

  it('should tick a target-scoped option without ticking its twin', async () => {
    mockUseSearch.mockReturnValue({ profile: 'public:car,local:car' });
    await enableFor('local__car', ['use_ferry']);
    renderWithQueryClient(<SettingsPanel />);

    expect(screen.getByTestId('include-local__car-use_ferry')).toBeChecked();
    expect(
      screen.getByTestId('include-public__car-use_ferry')
    ).not.toBeChecked();
  });

  it('should address the right instance when the same profile is edited twice', async () => {
    const user = userEvent.setup();
    mockUseSearch.mockReturnValue({ profile: 'public:car,local:car' });
    renderWithQueryClient(<SettingsPanel />);

    await user.click(screen.getByTestId('include-local__car-use_ferry'));

    expect(mockSetTargetEnabled).toHaveBeenCalledWith(
      targetRef('local', 'car'),
      'use_ferry',
      true
    );
    expect(mockSetTargetEnabled).not.toHaveBeenCalledWith(
      targetRef('public', 'car'),
      'use_ferry',
      true
    );
  });

  it('should reset every selected target', async () => {
    const user = userEvent.setup();
    mockUseSearch.mockReturnValue({ profile: 'public:car,local:emergency' });
    renderWithQueryClient(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: /^Reset$/i }));

    expect(mockResetSettings).toHaveBeenCalledWith([
      targetRef('public', 'car'),
      targetRef('local', 'emergency'),
    ]);
  });

  it('should call refetchDirections after reset', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: /^Reset$/i }));

    expect(mockRefetchDirections).toHaveBeenCalled();
  });

  it('should refetch isochrones instead when the isochrones tab is active', async () => {
    const user = userEvent.setup();
    mockUseParams.mockReturnValue({ activeTab: 'isochrones' });
    renderWithQueryClient(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: /^Reset$/i }));

    expect(mockRefetchIsochrones).toHaveBeenCalled();
    expect(mockRefetchDirections).not.toHaveBeenCalled();
  });

  it('should show Copied! feedback after clicking Copy to Clipboard', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPanel />);

    await user.click(
      screen.getByRole('button', { name: /Copy to Clipboard/i })
    );

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });

  it('should copy one costing payload per target, keyed by target', async () => {
    const user = userEvent.setup();
    mockUseSearch.mockReturnValue({ profile: 'public:car,local:car' });
    await enableFor('local__car', ['use_ferry']);
    renderWithQueryClient(<SettingsPanel />);

    await user.click(
      screen.getByRole('button', { name: /Copy to Clipboard/i })
    );

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });

    const copied = JSON.parse(await navigator.clipboard.readText()) as Record<
      string,
      Record<string, unknown>
    >;

    expect(Object.keys(copied)).toEqual(['public__car', 'local__car']);
    expect(copied.local__car).toHaveProperty('use_ferry');
    expect(copied.public__car).toEqual({});
  });

  it('should render the geocoding toggle', () => {
    renderWithQueryClient(<SettingsPanel />);
    expect(
      screen.getByRole('checkbox', { name: 'Geocoding' })
    ).toBeInTheDocument();
  });

  describe('Server Settings', () => {
    it('should render Server Settings section', () => {
      renderWithQueryClient(<SettingsPanel />);
      expect(screen.getByText('Server Settings')).toBeInTheDocument();
    });

    it('should count the configured instances in the subtitle', () => {
      renderWithQueryClient(<SettingsPanel />);
      expect(screen.getByText('(2)')).toBeInTheDocument();
    });

    it('should list every instance when expanded', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      expect(screen.getByTestId('instance-public')).toBeInTheDocument();
      expect(screen.getByTestId('instance-local')).toBeInTheDocument();
      expect(screen.getByTestId('add-instance-button')).toBeInTheDocument();
    });
  });

  describe('Enum Settings', () => {
    it('should render Bicycle Type select only once for bicycle profile', () => {
      renderWithQueryClient(<SettingsPanel />);
      const bicycleTypeLabels = screen.getAllByText('Bicycle Type');
      expect(bicycleTypeLabels).toHaveLength(1);
    });

    it('should display current bicycle_type value from settings', () => {
      renderWithQueryClient(<SettingsPanel />);
      // The seed has bicycle_type: 'Hybrid'
      expect(screen.getByText('Hybrid')).toBeInTheDocument();
    });

    it('should render Pedestrian Type select only once for pedestrian profile', () => {
      mockUseSearch.mockReturnValue({ profile: 'public:pedestrian' });
      renderWithQueryClient(<SettingsPanel />);
      const pedestrianTypeLabels = screen.getAllByText('Pedestrian Type');
      expect(pedestrianTypeLabels).toHaveLength(1);
    });

    it('should display current pedestrian type value from settings', () => {
      mockUseSearch.mockReturnValue({ profile: 'public:pedestrian' });
      renderWithQueryClient(<SettingsPanel />);
      // The seed has type: 'Foot'
      expect(screen.getByText('Foot')).toBeInTheDocument();
    });

    it('should render bicycle type combobox with correct id', () => {
      renderWithQueryClient(<SettingsPanel />);
      const bicycleTypeSelect = screen.getByRole('combobox', {
        name: /Bicycle Type/i,
      });
      expect(bicycleTypeSelect).toHaveAttribute(
        'id',
        'public__bicycle-bicycle_type'
      );
    });

    it('should render pedestrian type combobox with correct id', () => {
      mockUseSearch.mockReturnValue({ profile: 'public:pedestrian' });
      renderWithQueryClient(<SettingsPanel />);
      const pedestrianTypeSelect = screen.getByRole('combobox', {
        name: /Pedestrian Type/i,
      });
      expect(pedestrianTypeSelect).toHaveAttribute(
        'id',
        'public__pedestrian-type'
      );
    });
  });
});
