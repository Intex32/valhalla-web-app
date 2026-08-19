import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouteCard } from './route-card';
import type { ParsedDirectionsGeometry } from '@/components/types';
import { getTargetRouteColor } from '@/utils/profile-colors';
import type { ValhallaInstance } from '@/stores/instances-store';
import type { TargetRef } from '@/utils/targets';

const mockExportDataAsJson = vi.fn();
const mockDownloadFile = vi.fn();

/** `public` is index 0, `local` index 1 — the shade comes from that position. */
const mockInstances: ValhallaInstance[] = [
  { id: 'public', label: 'Public', url: 'https://valhalla1.openstreetmap.de' },
  { id: 'local', label: 'Local', url: 'http://localhost:8002' },
];

const publicCar: TargetRef = { instanceId: 'public', profile: 'car' };
const localCar: TargetRef = { instanceId: 'local', profile: 'car' };
const localTruck: TargetRef = { instanceId: 'local', profile: 'truck' };

vi.mock('@/stores/instances-store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/stores/instances-store')>();
  return {
    ...actual,
    useInstancesStore: vi.fn((selector) =>
      selector({ instances: mockInstances })
    ),
  };
});

vi.mock('@/utils/export', () => ({
  exportDataAsJson: (...args: unknown[]) => mockExportDataAsJson(...args),
}));

vi.mock('@/utils/download-file', () => ({
  downloadFile: (...args: unknown[]) => mockDownloadFile(...args),
}));

vi.mock('@/utils/date-time', () => ({
  getDateTimeString: () => '2024-01-01_12-00-00',
  formatDuration: (seconds: number) => `${Math.floor(seconds / 60)} min`,
}));

vi.mock('./summary', () => ({
  Summary: ({
    title,
    target,
    index,
  }: {
    summary: unknown;
    title: string;
    target: TargetRef;
    index: number;
    routeCoordinates: number[][];
  }) => (
    <div
      data-testid={`mock-summary-${index}`}
      data-instance={target.instanceId}
      data-profile={target.profile}
    >
      Summary: {title}
    </div>
  ),
}));

vi.mock('./maneuvers', () => ({
  Maneuvers: ({
    target,
    index,
  }: {
    legs: unknown[];
    target: TargetRef;
    index: number;
  }) => (
    <div
      data-testid={`mock-maneuvers-${index}`}
      data-instance={target.instanceId}
      data-profile={target.profile}
    >
      Maneuvers
    </div>
  ),
}));

const createMockData = (
  overrides: Partial<ParsedDirectionsGeometry> = {}
): ParsedDirectionsGeometry => ({
  id: 'test-route',
  trip: {
    locations: [],
    legs: [
      {
        maneuvers: [],
        summary: {
          has_time_restrictions: false,
          has_toll: false,
          has_highway: false,
          has_ferry: false,
          min_lat: 48.0,
          min_lon: 10.0,
          max_lat: 52.5,
          max_lon: 13.4,
          time: 3600,
          length: 150.5,
          cost: 100,
        },
        shape: 'encoded',
      },
    ],
    summary: {
      has_time_restrictions: false,
      has_toll: false,
      has_highway: false,
      has_ferry: false,
      min_lat: 48.0,
      min_lon: 10.0,
      max_lat: 52.5,
      max_lon: 13.4,
      time: 3600,
      length: 150.5,
      cost: 100,
    },
    status_message: 'OK',
    status: 0,
    units: 'kilometers',
    language: 'en',
  },
  decodedGeometry: [
    [52.5, 13.4],
    [52.4, 13.3],
    [52.3, 13.2],
  ],
  ...overrides,
});

describe('RouteCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const data = createMockData();
    expect(() =>
      render(
        <RouteCard
          data={data}
          target={localCar}
          index={0}
          isActive={true}
          onSelect={vi.fn()}
        />
      )
    ).not.toThrow();
  });

  it('should return null when trip is missing', () => {
    const data = {
      ...createMockData(),
      trip: undefined,
    } as unknown as ParsedDirectionsGeometry;
    const { container } = render(
      <RouteCard
        data={data}
        target={localCar}
        index={0}
        isActive={false}
        onSelect={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render Summary component with Main Route title', () => {
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={localCar}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByTestId('mock-summary-0')).toBeInTheDocument();
    expect(screen.getByText('Summary: Main Route')).toBeInTheDocument();
  });

  it('should render Summary component with Alternate Route title', () => {
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={localCar}
        index={1}
        isActive={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('Summary: Alternate Route #1')).toBeInTheDocument();
  });

  it('should render Show Maneuvers button', () => {
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={localCar}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: /show maneuvers/i })
    ).toBeInTheDocument();
  });

  it('should toggle maneuvers visibility when button is clicked', async () => {
    const user = userEvent.setup();
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={localCar}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /show maneuvers/i }));

    expect(
      screen.getByRole('button', { name: /hide maneuvers/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId('mock-maneuvers-0')).toBeInTheDocument();
  });

  it('should hide maneuvers when Hide Maneuvers is clicked', async () => {
    const user = userEvent.setup();
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={localCar}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /show maneuvers/i }));
    await user.click(screen.getByRole('button', { name: /hide maneuvers/i }));

    expect(
      screen.getByRole('button', { name: /show maneuvers/i })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('mock-maneuvers-0')).not.toBeInTheDocument();
  });

  it('should render Export button', () => {
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={localCar}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('should show export dropdown menu when Export is clicked', async () => {
    const user = userEvent.setup();
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={localCar}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /export/i }));

    expect(screen.getByRole('menuitem', { name: 'JSON' })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'GeoJSON' })
    ).toBeInTheDocument();
  });

  it('should call exportDataAsJson with an instance-qualified prefix', async () => {
    const user = userEvent.setup();
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={localCar}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(screen.getByRole('menuitem', { name: 'JSON' }));

    expect(mockExportDataAsJson).toHaveBeenCalledWith(
      data,
      'valhalla-directions-local-car'
    );
  });

  it('should name JSON exports after the instance that produced them', async () => {
    const user = userEvent.setup();
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={publicCar}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(screen.getByRole('menuitem', { name: 'JSON' }));

    // Same profile as the `local` card above — without the instance in the
    // name the two downloads would be indistinguishable.
    expect(mockExportDataAsJson).toHaveBeenCalledWith(
      data,
      'valhalla-directions-public-car'
    );
  });

  it('should call downloadFile with GeoJSON when GeoJSON is clicked', async () => {
    const user = userEvent.setup();
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={localCar}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(screen.getByRole('menuitem', { name: 'GeoJSON' }));

    expect(mockDownloadFile).toHaveBeenCalledWith({
      data: expect.stringContaining('"type": "Feature"'),
      fileName: 'valhalla-directions-local-car_2024-01-01_12-00-00.geojson',
      fileType: 'text/json',
    });
  });

  it('should name GeoJSON exports after the instance that produced them', async () => {
    const user = userEvent.setup();
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={publicCar}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(screen.getByRole('menuitem', { name: 'GeoJSON' }));

    expect(mockDownloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'valhalla-directions-public-car_2024-01-01_12-00-00.geojson',
      })
    );
  });

  it('should convert coordinates to GeoJSON format (lng, lat)', async () => {
    const user = userEvent.setup();
    const data = createMockData({
      decodedGeometry: [[52.5, 13.4]],
    });
    render(
      <RouteCard
        data={data}
        target={localCar}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(screen.getByRole('menuitem', { name: 'GeoJSON' }));

    const callArg = mockDownloadFile.mock.calls[0]?.[0] as {
      data: string;
      fileName: string;
      fileType: string;
    };
    const geoJson = JSON.parse(callArg.data);
    expect(geoJson.geometry.coordinates).toEqual([[13.4, 52.5]]);
  });

  it('should apply hover styles to card', () => {
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={localCar}
        index={0}
        isActive={false}
        onSelect={vi.fn()}
      />
    );

    const card = screen.getByTestId('mock-summary-0').parentElement;
    expect(card).toHaveClass('hover:bg-muted/50');
  });

  it('should apply different background when maneuvers are shown', async () => {
    const user = userEvent.setup();
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={localCar}
        index={0}
        isActive={false}
        onSelect={vi.fn()}
      />
    );

    const card = screen.getByTestId('mock-summary-0').parentElement;
    expect(card).toHaveClass('bg-background');

    await user.click(screen.getByRole('button', { name: /show maneuvers/i }));

    expect(card).toHaveClass('bg-muted/50');
  });

  it('should apply active styling when isActive is true', () => {
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={publicCar}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );

    const card = screen.getByTestId('mock-summary-0').parentElement;
    expect(card).toHaveClass('border-l-4');
    expect(card).toHaveStyle({
      borderLeftColor: getTargetRouteColor(0, 'car', 0),
    });
  });

  it('should tint the active border with the profile colour', () => {
    const data = createMockData();
    const { unmount } = render(
      <RouteCard
        data={data}
        target={publicCar}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByTestId('mock-summary-0').parentElement).toHaveStyle({
      borderLeftColor: getTargetRouteColor(0, 'car', 0),
    });
    unmount();

    render(
      <RouteCard
        data={data}
        target={{ instanceId: 'public', profile: 'emergency' }}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByTestId('mock-summary-0').parentElement).toHaveStyle({
      borderLeftColor: getTargetRouteColor(0, 'emergency', 0),
    });
    expect(getTargetRouteColor(0, 'emergency', 0)).not.toBe(
      getTargetRouteColor(0, 'car', 0)
    );
  });

  it('should shade the active border by instance for the same profile', () => {
    const data = createMockData();

    const { unmount } = render(
      <RouteCard
        data={data}
        target={publicCar}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );
    const publicColor =
      screen.getByTestId('mock-summary-0').parentElement?.style.borderLeftColor;
    unmount();

    render(
      <RouteCard
        data={data}
        target={localCar}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );
    const localColor =
      screen.getByTestId('mock-summary-0').parentElement?.style.borderLeftColor;

    // `public` is instance 0 and `local` instance 1: same hue, different shade,
    // which is what keeps two servers running `car` apart on the map.
    expect(publicColor).toBeTruthy();
    expect(localColor).toBeTruthy();
    expect(localColor).not.toBe(publicColor);
  });

  it('should fall back to the first instance shade for an unknown instance', () => {
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={{ instanceId: 'deleted-server', profile: 'car' }}
        index={0}
        isActive={true}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByTestId('mock-summary-0').parentElement).toHaveStyle({
      borderLeftColor: getTargetRouteColor(0, 'car', 0),
    });
  });

  it('should fade the active border for alternates of the same target', () => {
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={localCar}
        index={1}
        isActive={true}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByTestId('mock-summary-1').parentElement).toHaveStyle({
      borderLeftColor: getTargetRouteColor(1, 'car', 1),
    });
    expect(getTargetRouteColor(1, 'car', 1)).not.toBe(
      getTargetRouteColor(1, 'car', 0)
    );
  });

  it('should not apply active styling when isActive is false', () => {
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={localCar}
        index={0}
        isActive={false}
        onSelect={vi.fn()}
      />
    );

    const card = screen.getByTestId('mock-summary-0').parentElement;
    expect(card).not.toHaveClass('border-l-4');
    expect(card?.style.borderLeftColor).toBe('');
  });

  it('should forward the target to Summary and Maneuvers', async () => {
    const user = userEvent.setup();
    const data = createMockData();
    render(
      <RouteCard
        data={data}
        target={localTruck}
        index={0}
        isActive={false}
        onSelect={vi.fn()}
      />
    );

    const summary = screen.getByTestId('mock-summary-0');
    expect(summary).toHaveAttribute('data-profile', 'truck');
    expect(summary).toHaveAttribute('data-instance', 'local');

    await user.click(screen.getByRole('button', { name: /show maneuvers/i }));

    const maneuvers = screen.getByTestId('mock-maneuvers-0');
    expect(maneuvers).toHaveAttribute('data-profile', 'truck');
    expect(maneuvers).toHaveAttribute('data-instance', 'local');
  });

  it('should call onSelect when card is clicked', async () => {
    const user = userEvent.setup();
    const data = createMockData();
    const onSelect = vi.fn();
    render(
      <RouteCard
        data={data}
        target={localCar}
        index={0}
        isActive={false}
        onSelect={onSelect}
      />
    );

    const card = screen.getByTestId('mock-summary-0').parentElement!;
    await user.click(card);

    expect(onSelect).toHaveBeenCalled();
  });
});
