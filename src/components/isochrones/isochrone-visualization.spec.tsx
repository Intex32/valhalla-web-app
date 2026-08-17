import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IsochroneVisualization } from './isochrone-visualization';
import type { PaletteId } from '@/utils/isochrone-palettes';

const mockUpdateVisualization = vi.fn();

const mockState: {
  colorPalette: PaletteId;
  opacity: number;
  updateVisualization: typeof mockUpdateVisualization;
} = {
  colorPalette: 'default',
  opacity: 0.4,
  updateVisualization: mockUpdateVisualization,
};

vi.mock('@/stores/isochrones-store', () => ({
  useIsochronesStore: vi.fn((selector) => selector(mockState)),
}));

describe('IsochroneVisualization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.colorPalette = 'default';
    mockState.opacity = 0.4;
  });

  it('should render without crashing', () => {
    expect(() =>
      render(<IsochroneVisualization multipleProfiles={false} />)
    ).not.toThrow();
  });

  it('should render the color palette select for a single profile', () => {
    render(<IsochroneVisualization multipleProfiles={false} />);

    expect(screen.getByText('Color Palette')).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: /Color Palette/i })
    ).toBeInTheDocument();
  });

  it('should display the currently selected palette', () => {
    mockState.colorPalette = 'viridis';
    render(<IsochroneVisualization multipleProfiles={false} />);

    expect(
      screen.getByText('Viridis (colorblind-friendly)')
    ).toBeInTheDocument();
  });

  it('should hide the color palette select when several profiles are shown', () => {
    render(<IsochroneVisualization multipleProfiles={true} />);

    expect(screen.queryByText('Color Palette')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: /Color Palette/i })
    ).not.toBeInTheDocument();
  });

  it('should explain the per-profile shading when several profiles are shown', () => {
    render(<IsochroneVisualization multipleProfiles={true} />);

    expect(
      screen.getByText(/Each profile is shaded in its own colour/i)
    ).toBeInTheDocument();
  });

  it('should not show the per-profile shading note for a single profile', () => {
    render(<IsochroneVisualization multipleProfiles={false} />);

    expect(
      screen.queryByText(/Each profile is shaded in its own colour/i)
    ).not.toBeInTheDocument();
  });

  it('should render the opacity slider for a single profile', () => {
    render(<IsochroneVisualization multipleProfiles={false} />);

    expect(screen.getByText('Opacity')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('should render the opacity slider when several profiles are shown', () => {
    render(<IsochroneVisualization multipleProfiles={true} />);

    expect(screen.getByText('Opacity')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('should display the current opacity value', () => {
    mockState.opacity = 0.65;
    render(<IsochroneVisualization multipleProfiles={false} />);

    expect(screen.getByText('0.65')).toBeInTheDocument();
  });

  it('should update the opacity when a new value is typed', async () => {
    const user = userEvent.setup();
    render(<IsochroneVisualization multipleProfiles={false} />);

    await user.click(screen.getByRole('button', { name: '0.4' }));
    await user.clear(screen.getByRole('spinbutton'));
    await user.type(screen.getByRole('spinbutton'), '0.8{Enter}');

    expect(mockUpdateVisualization).toHaveBeenCalledWith({ opacity: 0.8 });
  });

  it('should clamp a typed opacity above the maximum', async () => {
    const user = userEvent.setup();
    render(<IsochroneVisualization multipleProfiles={false} />);

    await user.click(screen.getByRole('button', { name: '0.4' }));
    await user.clear(screen.getByRole('spinbutton'));
    await user.type(screen.getByRole('spinbutton'), '5{Enter}');

    expect(mockUpdateVisualization).toHaveBeenCalledWith({ opacity: 1 });
  });
});
