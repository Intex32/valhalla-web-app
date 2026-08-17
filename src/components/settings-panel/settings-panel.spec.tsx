import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const mockUpdateSharedSetting = vi.fn();
const mockSetSharedEnabled = vi.fn();
const mockUpdateProfileSetting = vi.fn();
const mockSetProfileEnabled = vi.fn();
const mockResetSettings = vi.fn();
const mockToggleSettings = vi.fn();
const mockRefetchDirections = vi.fn();
const mockRefetchIsochrones = vi.fn();

const mockUseParams = vi.fn(() => ({ activeTab: 'directions' }));
const mockUseSearch = vi.fn(() => ({ profile: 'bicycle' }));

vi.mock('@tanstack/react-router', () => ({
  useParams: () => mockUseParams(),
  useSearch: () => mockUseSearch(),
}));

/** Options the user has opted into sending; empty means "all server defaults". */
const enabledShared: Record<string, boolean> = {};
const enabledPerProfile: Record<string, Record<string, boolean>> = {};

// Only `useCommonStore` is stubbed — getProfileScope and the seeds stay real so
// the panel renders the same values it would in the app.
vi.mock('@/stores/common-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/common-store')>();
  const { settingsInit } = await import('./settings-options');

  return {
    ...actual,
    useCommonStore: vi.fn((selector: (state: unknown) => unknown) =>
      selector({
        shared: { values: { ...settingsInit }, enabled: enabledShared },
        perProfile: Object.fromEntries(
          Object.entries(enabledPerProfile).map(([profile, enabled]) => [
            profile,
            { values: { ...settingsInit }, enabled },
          ])
        ),
        settingsPanelOpen: true,
        updateSharedSetting: mockUpdateSharedSetting,
        setSharedEnabled: mockSetSharedEnabled,
        updateProfileSetting: mockUpdateProfileSetting,
        setProfileEnabled: mockSetProfileEnabled,
        resetSettings: mockResetSettings,
        toggleSettings: mockToggleSettings,
      })
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

const BASE_URL_STORAGE_KEY = 'valhalla_base_url';

describe('SettingsPanel', () => {
  const originalNavigator = global.navigator;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    for (const key of Object.keys(enabledShared)) delete enabledShared[key];
    for (const key of Object.keys(enabledPerProfile))
      delete enabledPerProfile[key];
    mockUseParams.mockReturnValue({ activeTab: 'directions' });
    mockUseSearch.mockReturnValue({ profile: 'bicycle' });
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

  it('should render the shared settings section', () => {
    renderWithQueryClient(<SettingsPanel />);
    expect(screen.getByText('Shared settings')).toBeInTheDocument();
  });

  it('should render one section per selected profile', () => {
    mockUseSearch.mockReturnValue({ profile: 'car,emergency' });
    renderWithQueryClient(<SettingsPanel />);

    expect(screen.getByText('Car settings')).toBeInTheDocument();
    expect(screen.getByText('Emergency settings')).toBeInTheDocument();
    expect(screen.queryByText('Bicycle settings')).not.toBeInTheDocument();
  });

  it('should tag each profile section so it can be styled per profile', () => {
    mockUseSearch.mockReturnValue({ profile: 'car,emergency' });
    renderWithQueryClient(<SettingsPanel />);

    expect(screen.getByTestId('profile-settings-car')).toBeInTheDocument();
    expect(
      screen.getByTestId('profile-settings-emergency')
    ).toBeInTheDocument();
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

  it("should render a profile's own options in its own section", () => {
    renderWithQueryClient(<SettingsPanel />);

    expect(screen.getByText('Cycling Speed')).toBeInTheDocument();
    expect(screen.getByText('Use Roads')).toBeInTheDocument();
    expect(screen.getByText('Use Hills')).toBeInTheDocument();
    expect(screen.getByText('Avoid Bad Surface')).toBeInTheDocument();
    expect(screen.getByText('Shortest')).toBeInTheDocument();
    expect(screen.getByText('Bicycle Type')).toBeInTheDocument();
  });

  it('should render the general options in the shared section', () => {
    renderWithQueryClient(<SettingsPanel />);

    expect(screen.getByText('Use Living Streets')).toBeInTheDocument();
    expect(screen.getByText('Use Ferries')).toBeInTheDocument();
    expect(screen.getByText('Service Penalty')).toBeInTheDocument();
  });

  it('should offer the turn penalty in the shared section, exactly once', () => {
    renderWithQueryClient(<SettingsPanel />);

    // maneuver_penalty is a general option; it used to be shadowed by a
    // per-profile duplicate labelled "Maneuver Penalty" and vanish from here.
    expect(screen.getByText('Turn Penalty')).toBeInTheDocument();
    expect(screen.getByTestId('include-maneuver_penalty')).toBeInTheDocument();
    expect(screen.queryByText('Maneuver Penalty')).not.toBeInTheDocument();
  });

  it('should keep the turn penalty in the shared section for several profiles', () => {
    mockUseSearch.mockReturnValue({ profile: 'car,emergency' });
    renderWithQueryClient(<SettingsPanel />);

    expect(screen.getAllByTestId('include-maneuver_penalty')).toHaveLength(1);
  });

  it('should render an include checkbox for every costing option', () => {
    renderWithQueryClient(<SettingsPanel />);

    expect(screen.getByTestId('include-cycling_speed')).toBeInTheDocument();
    expect(screen.getByTestId('include-shortest')).toBeInTheDocument();
    expect(screen.getByTestId('include-bicycle_type')).toBeInTheDocument();
    expect(screen.getByTestId('include-use_ferry')).toBeInTheDocument();
  });

  it('should leave request-level params out of the checkbox list', () => {
    renderWithQueryClient(<SettingsPanel />);
    expect(screen.queryByTestId('include-alternates')).not.toBeInTheDocument();
  });

  it('should start every option unticked so the server defaults apply', () => {
    renderWithQueryClient(<SettingsPanel />);
    expect(screen.getByTestId('include-cycling_speed')).not.toBeChecked();
    expect(screen.getByTestId('include-use_ferry')).not.toBeChecked();
  });

  it('should opt a profile option in when its checkbox is ticked', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPanel />);

    await user.click(screen.getByTestId('include-cycling_speed'));

    expect(mockSetProfileEnabled).toHaveBeenCalledWith(
      'bicycle',
      'cycling_speed',
      true
    );
    expect(mockRefetchDirections).toHaveBeenCalled();
  });

  it('should opt a shared option in when its checkbox is ticked', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPanel />);

    await user.click(screen.getByTestId('include-use_ferry'));

    expect(mockSetSharedEnabled).toHaveBeenCalledWith('use_ferry', true);
    expect(mockRefetchDirections).toHaveBeenCalled();
  });

  it('should opt an option back out when its checkbox is unticked', async () => {
    const user = userEvent.setup();
    enabledPerProfile.bicycle = { cycling_speed: true };
    renderWithQueryClient(<SettingsPanel />);

    expect(screen.getByTestId('include-cycling_speed')).toBeChecked();
    await user.click(screen.getByTestId('include-cycling_speed'));

    expect(mockSetProfileEnabled).toHaveBeenCalledWith(
      'bicycle',
      'cycling_speed',
      false
    );
  });

  it('should route a profile value edit to that profile', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPanel />);

    await user.click(screen.getByRole('checkbox', { name: 'Shortest' }));

    expect(mockUpdateProfileSetting).toHaveBeenCalledWith(
      'bicycle',
      'shortest',
      true
    );
    expect(mockRefetchDirections).toHaveBeenCalled();
  });

  it('should keep each profile section independent when several are selected', () => {
    mockUseSearch.mockReturnValue({ profile: 'car,truck' });
    renderWithQueryClient(<SettingsPanel />);

    // Both expose Width, so the checkbox ids must not collide across sections.
    expect(screen.getAllByTestId('include-width')).toHaveLength(2);
  });

  it('should reset every selected profile plus the shared scope', async () => {
    const user = userEvent.setup();
    mockUseSearch.mockReturnValue({ profile: 'car,emergency' });
    renderWithQueryClient(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: /^Reset$/i }));

    expect(mockResetSettings).toHaveBeenCalledWith(['car', 'emergency']);
  });

  it('should call refetchDirections after reset', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: /^Reset$/i }));

    expect(mockRefetchDirections).toHaveBeenCalled();
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

  describe('Server Settings', () => {
    it('should render Server Settings section', () => {
      renderWithQueryClient(<SettingsPanel />);
      expect(screen.getByText('Server Settings')).toBeInTheDocument();
    });

    it('should render Base URL label when expanded', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      expect(screen.getByText('Base URL')).toBeInTheDocument();
    });

    it('should render base URL input when expanded', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      expect(
        screen.getByRole('textbox', { name: /Base URL/i })
      ).toBeInTheDocument();
    });

    it('should render Reset Base URL button when expanded', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      expect(
        screen.getByRole('button', { name: /Reset Base URL/i })
      ).toBeInTheDocument();
    });

    it('should display stored base URL from localStorage', async () => {
      const user = userEvent.setup();
      const customUrl = 'https://custom.valhalla.com';
      localStorage.setItem(BASE_URL_STORAGE_KEY, customUrl);
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      const input = screen.getByRole('textbox', { name: /Base URL/i });
      expect(input).toHaveValue(customUrl);
    });

    it('should update input value when typing', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      const input = screen.getByRole('textbox', { name: /Base URL/i });
      await user.clear(input);
      await user.type(input, 'https://new.valhalla.com');

      expect(input).toHaveValue('https://new.valhalla.com');
    });

    it('should not save to localStorage while typing', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      const input = screen.getByRole('textbox', { name: /Base URL/i });
      await user.clear(input);
      await user.type(input, 'https://test.com');

      expect(localStorage.getItem(BASE_URL_STORAGE_KEY)).toBeNull();
    });

    it('should show error for invalid URL format on blur', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      const input = screen.getByRole('textbox', { name: /Base URL/i });
      await user.clear(input);
      await user.type(input, 'not-a-valid-url');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText('Invalid URL format')).toBeInTheDocument();
      });
    });

    it('should show error for non-http protocol on blur', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      const input = screen.getByRole('textbox', { name: /Base URL/i });
      await user.clear(input);
      await user.type(input, 'ftp://example.com');
      await user.tab();

      await waitFor(() => {
        expect(
          screen.getByText('URL must use HTTP or HTTPS protocol')
        ).toBeInTheDocument();
      });
    });

    it('should clear error when typing after error', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      const input = screen.getByRole('textbox', { name: /Base URL/i });
      await user.clear(input);
      await user.type(input, 'invalid');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText('Invalid URL format')).toBeInTheDocument();
      });

      await user.type(input, 'https://valid.com');

      await waitFor(() => {
        expect(
          screen.queryByText('Invalid URL format')
        ).not.toBeInTheDocument();
      });
    });

    it('should have aria-invalid attribute when there is an error', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      const input = screen.getByRole('textbox', { name: /Base URL/i });
      await user.clear(input);
      await user.type(input, 'invalid');
      await user.tab();

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('should reset base URL to default when Reset Base URL is clicked', async () => {
      const user = userEvent.setup();
      const customUrl = 'https://custom.valhalla.com';
      localStorage.setItem(BASE_URL_STORAGE_KEY, customUrl);
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      const resetButton = screen.getByRole('button', {
        name: /Reset Base URL/i,
      });
      await user.click(resetButton);

      expect(localStorage.getItem(BASE_URL_STORAGE_KEY)).toBeNull();
    });

    it('should disable Reset Base URL button when URL equals default', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      const resetButton = screen.getByRole('button', {
        name: /Reset Base URL/i,
      });
      expect(resetButton).toBeDisabled();
    });

    it('should enable Reset Base URL button when URL differs from default', async () => {
      const user = userEvent.setup();
      const customUrl = 'https://custom.valhalla.com';
      localStorage.setItem(BASE_URL_STORAGE_KEY, customUrl);
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      const resetButton = screen.getByRole('button', {
        name: /Reset Base URL/i,
      });
      expect(resetButton).toBeEnabled();
    });

    it('should not re-send request on blur when input is in error state and value unchanged', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      const input = screen.getByRole('textbox', { name: /Base URL/i });
      await user.clear(input);
      await user.type(input, 'invalid-url');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText('Invalid URL format')).toBeInTheDocument();
      });

      await user.click(input);
      await user.tab();

      expect(screen.getByText('Invalid URL format')).toBeInTheDocument();
    });

    it('should re-send request on blur after user modifies the error input value', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      const input = screen.getByRole('textbox', { name: /Base URL/i });
      await user.clear(input);
      await user.type(input, 'invalid-url');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText('Invalid URL format')).toBeInTheDocument();
      });

      await user.type(input, '-modified');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText('Invalid URL format')).toBeInTheDocument();
      });
    });

    it('should clear error state when reset button is clicked after error', async () => {
      const user = userEvent.setup();
      const customUrl = 'https://custom.valhalla.com';
      localStorage.setItem(BASE_URL_STORAGE_KEY, customUrl);
      renderWithQueryClient(<SettingsPanel />);

      await user.click(screen.getByText('Server Settings'));

      const input = screen.getByRole('textbox', { name: /Base URL/i });
      await user.clear(input);
      await user.type(input, 'invalid-url');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText('Invalid URL format')).toBeInTheDocument();
      });

      const resetButton = screen.getByRole('button', {
        name: /Reset Base URL/i,
      });
      await user.click(resetButton);

      expect(screen.queryByText('Invalid URL format')).not.toBeInTheDocument();
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
      // The mock has bicycle_type: 'Hybrid'
      expect(screen.getByText('Hybrid')).toBeInTheDocument();
    });

    it('should render Pedestrian Type select only once for pedestrian profile', () => {
      mockUseSearch.mockReturnValue({ profile: 'pedestrian' });
      renderWithQueryClient(<SettingsPanel />);
      const pedestrianTypeLabels = screen.getAllByText('Pedestrian Type');
      expect(pedestrianTypeLabels).toHaveLength(1);
    });

    it('should display current pedestrian type value from settings', () => {
      mockUseSearch.mockReturnValue({ profile: 'pedestrian' });
      renderWithQueryClient(<SettingsPanel />);
      // The mock has type: 'Foot'
      expect(screen.getByText('Foot')).toBeInTheDocument();
    });

    it('should render bicycle type combobox with correct id', () => {
      renderWithQueryClient(<SettingsPanel />);
      const bicycleTypeSelect = screen.getByRole('combobox', {
        name: /Bicycle Type/i,
      });
      expect(bicycleTypeSelect).toBeInTheDocument();
    });

    it('should render pedestrian type combobox with correct id', () => {
      mockUseSearch.mockReturnValue({ profile: 'pedestrian' });
      renderWithQueryClient(<SettingsPanel />);
      const pedestrianTypeSelect = screen.getByRole('combobox', {
        name: /Pedestrian Type/i,
      });
      expect(pedestrianTypeSelect).toBeInTheDocument();
    });
  });
});
