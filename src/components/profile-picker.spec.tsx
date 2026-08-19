import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfilePicker } from './profile-picker';
import { useSearch } from '@tanstack/react-router';
import { getTargetColor } from '@/utils/profile-colors';

const mockOnTargetsChange = vi.fn();

const instances = [
  { id: 'public', label: 'Public', url: 'https://valhalla1.openstreetmap.de' },
  { id: 'local', label: 'Local', url: 'http://localhost:8002' },
];

vi.mock('@tanstack/react-router', () => ({
  useSearch: vi.fn(() => ({ profile: 'public:bicycle' })),
}));

vi.mock('@/stores/instances-store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/stores/instances-store')>();
  return {
    ...actual,
    useInstancesStore: vi.fn((selector: (state: unknown) => unknown) =>
      selector({ instances })
    ),
  };
});

/**
 * The picker reads its selection from the comma-separated, instance-qualified
 * `profile` param — `public:car,local:emergency`.
 */
const selectTargets = (profile: string) => {
  (useSearch as Mock).mockReturnValue({ profile });
};

const renderPicker = (loading = false) =>
  render(
    <ProfilePicker loading={loading} onTargetsChange={mockOnTargetsChange} />
  );

describe('ProfilePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectTargets('public:bicycle');
  });

  it('should render without crashing', () => {
    expect(() => renderPicker()).not.toThrow();
  });

  it('should render one row of profile buttons per instance', () => {
    renderPicker();

    for (const profile of [
      'bicycle',
      'pedestrian',
      'car',
      'truck',
      'bus',
      'motor_scooter',
      'motorcycle',
      'emergency',
    ]) {
      expect(
        screen.getByTestId(`profile-button-public__${profile}`)
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`profile-button-local__${profile}`)
      ).toBeInTheDocument();
    }
  });

  it('should label each instance row with its name and url', () => {
    renderPicker();

    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();
    expect(
      screen.getByText('https://valhalla1.openstreetmap.de')
    ).toBeInTheDocument();
    expect(screen.getByText('http://localhost:8002')).toBeInTheDocument();
  });

  it('should highlight the selected target only on its own instance', () => {
    renderPicker();

    const selected = screen.getByTestId('profile-button-public__bicycle');
    expect(selected).toHaveAttribute('data-state', 'on');
    expect(selected).toHaveAttribute('aria-pressed', 'true');

    // Same profile, other server — a different target, so it stays off.
    const sameProfileElsewhere = screen.getByTestId(
      'profile-button-local__bicycle'
    );
    expect(sameProfileElsewhere).toHaveAttribute('data-state', 'off');
    expect(sameProfileElsewhere).toHaveAttribute('aria-pressed', 'false');

    expect(screen.getByTestId('profile-button-public__car')).toHaveAttribute(
      'data-state',
      'off'
    );
  });

  it('should highlight every target in a multi-instance selection', () => {
    selectTargets('public:bicycle,local:car');
    renderPicker();

    expect(
      screen.getByTestId('profile-button-public__bicycle')
    ).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('profile-button-local__car')).toHaveAttribute(
      'data-state',
      'on'
    );
    expect(screen.getByTestId('profile-button-public__car')).toHaveAttribute(
      'data-state',
      'off'
    );
    expect(screen.getByTestId('profile-button-local__bicycle')).toHaveAttribute(
      'data-state',
      'off'
    );
  });

  it('should treat a bare profile as belonging to the first instance', () => {
    selectTargets('bicycle');
    renderPicker();

    // Pre-multi-instance permalinks keep working.
    expect(
      screen.getByTestId('profile-button-public__bicycle')
    ).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('profile-button-local__bicycle')).toHaveAttribute(
      'data-state',
      'off'
    );
  });

  it('should add a target to the selection instead of replacing it', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByTestId('profile-button-public__car'));

    expect(mockOnTargetsChange).toHaveBeenCalledWith([
      { instanceId: 'public', profile: 'bicycle' },
      { instanceId: 'public', profile: 'car' },
    ]);
  });

  it('should not disturb another instances selection when picking a profile', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByTestId('profile-button-local__emergency'));

    expect(mockOnTargetsChange).toHaveBeenCalledWith([
      { instanceId: 'public', profile: 'bicycle' },
      { instanceId: 'local', profile: 'emergency' },
    ]);
  });

  it('should keep the same profile on two instances as two separate targets', async () => {
    const user = userEvent.setup();
    selectTargets('public:car');
    renderPicker();

    await user.click(screen.getByTestId('profile-button-local__car'));

    expect(mockOnTargetsChange).toHaveBeenCalledWith([
      { instanceId: 'public', profile: 'car' },
      { instanceId: 'local', profile: 'car' },
    ]);
  });

  it('should keep the selection in the pickers left-to-right order', async () => {
    const user = userEvent.setup();
    selectTargets('public:car');
    renderPicker();

    // `bicycle` sits left of `car` in the picker, so it leads the new list.
    await user.click(screen.getByTestId('profile-button-public__bicycle'));

    expect(mockOnTargetsChange).toHaveBeenCalledWith([
      { instanceId: 'public', profile: 'bicycle' },
      { instanceId: 'public', profile: 'car' },
    ]);
  });

  it('should rebuild the selection in instance-list order', async () => {
    const user = userEvent.setup();
    selectTargets('local:car');
    renderPicker();

    await user.click(screen.getByTestId('profile-button-public__truck'));

    // `public` comes first in the instance list, so it leads regardless of
    // which row was clicked last.
    expect(mockOnTargetsChange).toHaveBeenCalledWith([
      { instanceId: 'public', profile: 'truck' },
      { instanceId: 'local', profile: 'car' },
    ]);
  });

  it('should deselect a target when more than one is selected', async () => {
    const user = userEvent.setup();
    selectTargets('public:bicycle,public:car');
    renderPicker();

    await user.click(screen.getByTestId('profile-button-public__car'));

    expect(mockOnTargetsChange).toHaveBeenCalledWith([
      { instanceId: 'public', profile: 'bicycle' },
    ]);
  });

  it('should allow clearing an instance while another instance still has a target', async () => {
    const user = userEvent.setup();
    selectTargets('public:bicycle,local:car');
    renderPicker();

    await user.click(screen.getByTestId('profile-button-public__bicycle'));

    expect(mockOnTargetsChange).toHaveBeenCalledWith([
      { instanceId: 'local', profile: 'car' },
    ]);
  });

  it('should not deselect the last remaining target across all instances', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByTestId('profile-button-public__bicycle'));

    expect(mockOnTargetsChange).not.toHaveBeenCalled();
  });

  it('should render a colour swatch for each selected target only', () => {
    selectTargets('public:car,local:car');
    renderPicker();

    const swatchOf = (key: string) =>
      screen
        .getByTestId(`profile-button-${key}`)
        .querySelector('[aria-hidden="true"]');

    expect(swatchOf('public__car')).toHaveStyle({
      backgroundColor: getTargetColor(0, 'car'),
    });
    // The second instance shades the same hue so the two are tellable apart.
    expect(swatchOf('local__car')).toHaveStyle({
      backgroundColor: getTargetColor(1, 'car'),
    });
    expect(getTargetColor(1, 'car')).not.toBe(getTargetColor(0, 'car'));

    expect(swatchOf('public__truck')).toBeNull();
    expect(swatchOf('local__truck')).toBeNull();
  });

  it('should hint at multi-select when a single target is selected', () => {
    renderPicker();

    expect(
      screen.getByText(
        'Select more profiles, on any server, to compare them side by side.'
      )
    ).toBeInTheDocument();
  });

  it('should report how many targets are being compared', () => {
    selectTargets('public:bicycle,public:car,local:bicycle');
    renderPicker();

    expect(
      screen.getByText(
        'Comparing 3 targets — each is routed between the same waypoints.'
      )
    ).toBeInTheDocument();
  });

  it('should show loading spinner on selected targets when loading is true', () => {
    selectTargets('public:bicycle,local:car');
    renderPicker(true);

    expect(
      screen
        .getByTestId('profile-button-public__bicycle')
        .querySelector('.animate-spin')
    ).toBeInTheDocument();
    expect(
      screen
        .getByTestId('profile-button-local__car')
        .querySelector('.animate-spin')
    ).toBeInTheDocument();
  });

  it('should not show loading spinner on unselected targets when loading is true', () => {
    renderPicker(true);

    expect(
      screen
        .getByTestId('profile-button-public__car')
        .querySelector('.animate-spin')
    ).not.toBeInTheDocument();
    // Same profile on the other server is a separate, unselected target.
    expect(
      screen
        .getByTestId('profile-button-local__bicycle')
        .querySelector('.animate-spin')
    ).not.toBeInTheDocument();
  });

  it('should have accessible labels naming both the profile and the instance', () => {
    renderPicker();

    // ToggleGroup type="multiple" renders toggle buttons, not radios.
    for (const label of [
      'Bicycle',
      'Pedestrian',
      'Car',
      'Truck',
      'Bus',
      'Motor Scooter',
      'Motorcycle',
      'Emergency',
    ]) {
      expect(
        screen.getByRole('button', {
          name: `Select ${label} profile on Public`,
        })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: `Select ${label} profile on Local` })
      ).toBeInTheDocument();
    }
  });

  it('should show a tooltip naming the profile and the instance on hover', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.hover(screen.getByTestId('profile-button-local__truck'));

    expect(
      await screen.findByRole('tooltip', { name: /Truck.*Local/ })
    ).toBeInTheDocument();
  });
});
