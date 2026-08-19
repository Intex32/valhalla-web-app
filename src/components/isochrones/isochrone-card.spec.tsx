import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IsochroneCard } from './isochrone-card';
import type { ValhallaIsochroneResponse } from '@/components/types';
import { getTargetColor } from '@/utils/profile-colors';
import type { TargetRef } from '@/utils/targets';

const mockToggleShowOnMap = vi.fn();
const mockExportDataAsJson = vi.fn();

const instances = [
  { id: 'public', label: 'Public', url: 'https://valhalla1.openstreetmap.de' },
  { id: 'local', label: 'Local', url: 'http://localhost:8002' },
];

vi.mock('@/stores/isochrones-store', () => ({
  useIsochronesStore: vi.fn((selector) =>
    selector({
      toggleShowOnMap: mockToggleShowOnMap,
    })
  ),
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

vi.mock('@/utils/export', () => ({
  exportDataAsJson: (...args: unknown[]) => mockExportDataAsJson(...args),
}));

const target = (instanceId: string, profile: string): TargetRef =>
  ({ instanceId, profile }) as TargetRef;

const createMockData = (
  features: {
    properties: { contour: number; area: number; type?: string };
  }[] = []
): ValhallaIsochroneResponse => ({
  type: 'FeatureCollection',
  id: 'test-isochrone',
  features: features.map((f) => ({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [] },
    properties: f.properties,
  })),
});

describe('IsochroneCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    expect(() =>
      render(
        <IsochroneCard
          data={data}
          target={target('public', 'car')}
          showProfileLabel={false}
          showOnMap={true}
        />
      )
    ).not.toThrow();
  });

  it('should display "No isochrones found" when features array is empty', () => {
    const data = createMockData([]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={true}
      />
    );

    expect(screen.getByText('No isochrones found')).toBeInTheDocument();
  });

  it('should display "Main Isochrone" header when features exist', () => {
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={true}
      />
    );

    expect(screen.getByText('Main Isochrone')).toBeInTheDocument();
  });

  it('should display the profile label instead of "Main Isochrone" when showProfileLabel is true', () => {
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'emergency')}
        showProfileLabel={true}
        showOnMap={true}
      />
    );

    expect(screen.getByText('Emergency')).toBeInTheDocument();
    expect(screen.queryByText('Main Isochrone')).not.toBeInTheDocument();
  });

  it('should render a colour dot in the target colour when showProfileLabel is true', () => {
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    const { container } = render(
      <IsochroneCard
        data={data}
        target={target('public', 'emergency')}
        showProfileLabel={true}
        showOnMap={true}
      />
    );

    const colorDot = container.querySelector('span[aria-hidden]');
    expect(colorDot).toBeInTheDocument();
    // First instance keeps the untouched profile colour.
    expect(colorDot).toHaveStyle({ backgroundColor: '#dc2626' });
  });

  it('should shade the colour dot per instance so the same profile stays distinguishable', () => {
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    const { container } = render(
      <IsochroneCard
        data={data}
        target={target('local', 'emergency')}
        showProfileLabel={true}
        showOnMap={true}
      />
    );

    const shaded = getTargetColor(1, 'emergency');
    expect(shaded).not.toBe('#dc2626');
    expect(container.querySelector('span[aria-hidden]')).toHaveStyle({
      backgroundColor: shaded,
    });
  });

  it('should not render a colour dot when showProfileLabel is false', () => {
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    const { container } = render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={true}
      />
    );

    expect(
      container.querySelector('span[aria-hidden]')
    ).not.toBeInTheDocument();
  });

  it('should tag the card with a target-scoped test id', () => {
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    render(
      <IsochroneCard
        data={data}
        target={target('local', 'bicycle')}
        showProfileLabel={true}
        showOnMap={true}
      />
    );

    expect(
      screen.getByTestId('isochrone-card-local__bicycle')
    ).toBeInTheDocument();
  });

  it('should give the same profile on two instances different test ids', () => {
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    render(
      <>
        <IsochroneCard
          data={data}
          target={target('public', 'car')}
          showProfileLabel={true}
          showOnMap={true}
        />
        <IsochroneCard
          data={data}
          target={target('local', 'car')}
          showProfileLabel={true}
          showOnMap={true}
        />
      </>
    );

    expect(
      screen.getByTestId('isochrone-card-public__car')
    ).toBeInTheDocument();
    expect(screen.getByTestId('isochrone-card-local__car')).toBeInTheDocument();
  });

  it('should render show on map switch', () => {
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={true}
      />
    );

    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByLabelText('Show on map')).toBeInTheDocument();
  });

  it('should scope the switch id to the target', () => {
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    render(
      <IsochroneCard
        data={data}
        target={target('local', 'truck')}
        showProfileLabel={true}
        showOnMap={true}
      />
    );

    expect(screen.getByRole('switch')).toHaveAttribute(
      'id',
      'show-on-map-local__truck'
    );
  });

  it('should have switch checked when showOnMap is true', () => {
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={true}
      />
    );

    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('should have switch unchecked when showOnMap is false', () => {
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={false}
      />
    );

    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('should call toggleShowOnMap with the target when switch is toggled', async () => {
    const user = userEvent.setup();
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    render(
      <IsochroneCard
        data={data}
        target={target('local', 'car')}
        showProfileLabel={false}
        showOnMap={true}
      />
    );

    await user.click(screen.getByRole('switch'));

    expect(mockToggleShowOnMap).toHaveBeenCalledWith({
      target: { instanceId: 'local', profile: 'car' },
      show: false,
    });
  });

  it('should display contour value with minutes label', () => {
    const data = createMockData([{ properties: { contour: 15, area: 5 } }]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={true}
      />
    );

    expect(screen.getByText('15 minutes')).toBeInTheDocument();
    expect(screen.getByText('Contour')).toBeInTheDocument();
  });

  it('should display area value with km² label for area > 1', () => {
    const data = createMockData([{ properties: { contour: 10, area: 5.678 } }]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={true}
      />
    );

    expect(screen.getByText('6 km²')).toBeInTheDocument();
    expect(screen.getByText('Area')).toBeInTheDocument();
  });

  it('should display area value with one decimal for area <= 1', () => {
    const data = createMockData([{ properties: { contour: 10, area: 0.456 } }]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={true}
      />
    );

    expect(screen.getByText('0.5 km²')).toBeInTheDocument();
  });

  it('should render multiple isochrone features', () => {
    const data = createMockData([
      { properties: { contour: 5, area: 2 } },
      { properties: { contour: 10, area: 5 } },
      { properties: { contour: 15, area: 10 } },
    ]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={true}
      />
    );

    expect(screen.getByText('5 minutes')).toBeInTheDocument();
    expect(screen.getByText('10 minutes')).toBeInTheDocument();
    expect(screen.getByText('15 minutes')).toBeInTheDocument();
  });

  it('should filter out features with type property', () => {
    const data = createMockData([
      { properties: { contour: 10, area: 5 } },
      { properties: { contour: 15, area: 8, type: 'outline' } },
    ]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={true}
      />
    );

    expect(screen.getByText('10 minutes')).toBeInTheDocument();
    expect(screen.queryByText('15 minutes')).not.toBeInTheDocument();
  });

  it('should render Export button', () => {
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={true}
      />
    );

    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('should show dropdown menu when Export is clicked', async () => {
    const user = userEvent.setup();
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={true}
      />
    );

    await user.click(screen.getByRole('button', { name: /export/i }));

    expect(screen.getByRole('menuitem', { name: 'JSON' })).toBeInTheDocument();
  });

  it('should call exportDataAsJson with a target-scoped file name', async () => {
    const user = userEvent.setup();
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={true}
      />
    );

    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(screen.getByRole('menuitem', { name: 'JSON' }));

    expect(mockExportDataAsJson).toHaveBeenCalledWith(
      data,
      'valhalla-isochrones-public__car'
    );
  });

  it('should name the export after the instance as well as the profile', async () => {
    const user = userEvent.setup();
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    render(
      <IsochroneCard
        data={data}
        target={target('local', 'emergency')}
        showProfileLabel={true}
        showOnMap={true}
      />
    );

    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(screen.getByRole('menuitem', { name: 'JSON' }));

    expect(mockExportDataAsJson).toHaveBeenCalledWith(
      data,
      'valhalla-isochrones-local__emergency'
    );
  });

  it('should handle switch toggle to enable show on map', async () => {
    const user = userEvent.setup();
    const data = createMockData([{ properties: { contour: 10, area: 5 } }]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={false}
      />
    );

    await user.click(screen.getByRole('switch'));

    expect(mockToggleShowOnMap).toHaveBeenCalledWith({
      target: { instanceId: 'public', profile: 'car' },
      show: true,
    });
  });

  it('should not render switch when no features', () => {
    const data = createMockData([]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={true}
      />
    );

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('should not render Export button when no features', () => {
    const data = createMockData([]);
    render(
      <IsochroneCard
        data={data}
        target={target('public', 'car')}
        showProfileLabel={false}
        showOnMap={true}
      />
    );

    expect(
      screen.queryByRole('button', { name: /export/i })
    ).not.toBeInTheDocument();
  });
});
