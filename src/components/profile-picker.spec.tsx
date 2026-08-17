import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfilePicker } from './profile-picker';
import { useSearch } from '@tanstack/react-router';
import { getProfileColor } from '@/utils/profile-colors';

const mockResetSettings = vi.fn();
const mockOnProfileChange = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useSearch: vi.fn(() => ({ profile: 'bicycle' })),
}));

vi.mock('@/stores/common-store', () => ({
  useCommonStore: vi.fn((selector) =>
    selector({
      resetSettings: mockResetSettings,
    })
  ),
}));

/** The picker reads its selection from the comma-separated `profile` param. */
const selectProfiles = (profile: string) => {
  (useSearch as Mock).mockReturnValue({ profile });
};

describe('ProfilePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectProfiles('bicycle');
  });

  it('should render without crashing', () => {
    expect(() =>
      render(
        <ProfilePicker loading={false} onProfileChange={mockOnProfileChange} />
      )
    ).not.toThrow();
  });

  it('should render all profile buttons', () => {
    render(
      <ProfilePicker loading={false} onProfileChange={mockOnProfileChange} />
    );

    expect(screen.getByTestId('profile-button-bicycle')).toBeInTheDocument();
    expect(screen.getByTestId('profile-button-pedestrian')).toBeInTheDocument();
    expect(screen.getByTestId('profile-button-car')).toBeInTheDocument();
    expect(screen.getByTestId('profile-button-truck')).toBeInTheDocument();
    expect(screen.getByTestId('profile-button-bus')).toBeInTheDocument();
    expect(
      screen.getByTestId('profile-button-motor_scooter')
    ).toBeInTheDocument();
    expect(screen.getByTestId('profile-button-motorcycle')).toBeInTheDocument();
    expect(screen.getByTestId('profile-button-emergency')).toBeInTheDocument();
  });

  it('should highlight the selected profile', () => {
    render(
      <ProfilePicker loading={false} onProfileChange={mockOnProfileChange} />
    );

    const bicycleButton = screen.getByTestId('profile-button-bicycle');
    expect(bicycleButton).toHaveAttribute('data-state', 'on');
    expect(bicycleButton).toHaveAttribute('aria-pressed', 'true');

    const carButton = screen.getByTestId('profile-button-car');
    expect(carButton).toHaveAttribute('data-state', 'off');
    expect(carButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('should highlight every profile in a multi-profile selection', () => {
    selectProfiles('bicycle,car');
    render(
      <ProfilePicker loading={false} onProfileChange={mockOnProfileChange} />
    );

    expect(screen.getByTestId('profile-button-bicycle')).toHaveAttribute(
      'data-state',
      'on'
    );
    expect(screen.getByTestId('profile-button-car')).toHaveAttribute(
      'data-state',
      'on'
    );
    expect(screen.getByTestId('profile-button-truck')).toHaveAttribute(
      'data-state',
      'off'
    );
  });

  it('should add a profile to the selection instead of replacing it', async () => {
    const user = userEvent.setup();
    render(
      <ProfilePicker loading={false} onProfileChange={mockOnProfileChange} />
    );

    await user.click(screen.getByTestId('profile-button-car'));

    expect(mockOnProfileChange).toHaveBeenCalledWith(['bicycle', 'car']);
    // The primary profile is unchanged, so the user's tuning must survive.
    expect(mockResetSettings).not.toHaveBeenCalled();
  });

  it('should keep the selection in the pickers left-to-right order', async () => {
    const user = userEvent.setup();
    selectProfiles('car');
    render(
      <ProfilePicker loading={false} onProfileChange={mockOnProfileChange} />
    );

    // `bicycle` sits left of `car` in the picker, so it leads the new list.
    await user.click(screen.getByTestId('profile-button-bicycle'));

    expect(mockOnProfileChange).toHaveBeenCalledWith(['bicycle', 'car']);
    // Here the primary really does change (car -> bicycle), so settings reset.
    expect(mockResetSettings).toHaveBeenCalledWith('bicycle');
  });

  it('should deselect a profile when more than one is selected', async () => {
    const user = userEvent.setup();
    selectProfiles('bicycle,car');
    render(
      <ProfilePicker loading={false} onProfileChange={mockOnProfileChange} />
    );

    await user.click(screen.getByTestId('profile-button-car'));

    expect(mockOnProfileChange).toHaveBeenCalledWith(['bicycle']);
    // Dropping a comparison profile leaves the primary — and its settings — alone.
    expect(mockResetSettings).not.toHaveBeenCalled();
  });

  it('should reset settings when dropping the primary profile promotes another', async () => {
    const user = userEvent.setup();
    selectProfiles('bicycle,car');
    render(
      <ProfilePicker loading={false} onProfileChange={mockOnProfileChange} />
    );

    await user.click(screen.getByTestId('profile-button-bicycle'));

    expect(mockOnProfileChange).toHaveBeenCalledWith(['car']);
    expect(mockResetSettings).toHaveBeenCalledWith('car');
  });

  it('should not deselect the last remaining profile', async () => {
    const user = userEvent.setup();
    render(
      <ProfilePicker loading={false} onProfileChange={mockOnProfileChange} />
    );

    await user.click(screen.getByTestId('profile-button-bicycle'));

    expect(mockResetSettings).not.toHaveBeenCalled();
    expect(mockOnProfileChange).not.toHaveBeenCalled();
  });

  it('should render a colour swatch for each selected profile only', () => {
    selectProfiles('bicycle,car');
    render(
      <ProfilePicker loading={false} onProfileChange={mockOnProfileChange} />
    );

    const swatchOf = (profile: string) =>
      screen
        .getByTestId(`profile-button-${profile}`)
        .querySelector('[aria-hidden="true"]');

    expect(swatchOf('bicycle')).toHaveStyle({
      backgroundColor: getProfileColor('bicycle'),
    });
    expect(swatchOf('car')).toHaveStyle({
      backgroundColor: getProfileColor('car'),
    });
    expect(swatchOf('truck')).toBeNull();
  });

  it('should hint at multi-select when a single profile is selected', () => {
    render(
      <ProfilePicker loading={false} onProfileChange={mockOnProfileChange} />
    );

    expect(
      screen.getByText(
        'Select more than one profile to compare them side by side.'
      )
    ).toBeInTheDocument();
  });

  it('should report how many profiles are being compared', () => {
    selectProfiles('bicycle,car,truck');
    render(
      <ProfilePicker loading={false} onProfileChange={mockOnProfileChange} />
    );

    expect(
      screen.getByText(
        'Comparing 3 profiles — each is routed between the same waypoints.'
      )
    ).toBeInTheDocument();
  });

  it('should show loading spinner on selected profiles when loading is true', () => {
    selectProfiles('bicycle,car');
    render(
      <ProfilePicker loading={true} onProfileChange={mockOnProfileChange} />
    );

    expect(
      screen
        .getByTestId('profile-button-bicycle')
        .querySelector('.animate-spin')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('profile-button-car').querySelector('.animate-spin')
    ).toBeInTheDocument();
  });

  it('should not show loading spinner on unselected profiles when loading is true', () => {
    render(
      <ProfilePicker loading={true} onProfileChange={mockOnProfileChange} />
    );

    const carButton = screen.getByTestId('profile-button-car');
    expect(carButton.querySelector('.animate-spin')).not.toBeInTheDocument();
  });

  it('should have accessible labels for each profile button', () => {
    render(
      <ProfilePicker loading={false} onProfileChange={mockOnProfileChange} />
    );

    // ToggleGroup type="multiple" renders toggle buttons, not radios.
    expect(
      screen.getByRole('button', { name: 'Select Bicycle profile' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Select Pedestrian profile' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Select Car profile' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Select Truck profile' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Select Bus profile' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Select Motor Scooter profile' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Select Motorcycle profile' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Select Emergency profile' })
    ).toBeInTheDocument();
  });

  it('should show tooltip on hover', async () => {
    const user = userEvent.setup();
    render(
      <ProfilePicker loading={false} onProfileChange={mockOnProfileChange} />
    );

    await user.hover(screen.getByTestId('profile-button-truck'));

    expect(
      await screen.findByRole('tooltip', { name: 'Truck' })
    ).toBeInTheDocument();
  });
});
