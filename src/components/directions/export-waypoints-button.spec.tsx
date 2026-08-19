import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ExportWaypointsButton,
  formatWaypointExport,
} from './export-waypoints-button';
import type { ActiveWaypoint } from '@/components/types';
import type { Waypoint } from '@/stores/directions-store';

let mockWaypoints: Waypoint[] = [];

vi.mock('@/stores/directions-store', () => ({
  useDirectionsStore: vi.fn(
    (selector: (state: { waypoints: Waypoint[] }) => unknown) =>
      selector({ waypoints: mockWaypoints })
  ),
}));

// The real module pulls in the router and every query hook; only the waypoint
// derivation matters here, so it is mirrored one-to-one.
vi.mock('@/hooks/use-directions-queries', () => ({
  getActiveWaypoints: (waypoints: Waypoint[]): ActiveWaypoint[] =>
    waypoints.flatMap((waypoint) =>
      waypoint.geocodeResults.filter((geocodeResult) => geocodeResult.selected)
    ),
}));

/** Coordinates are stored `[lng, lat]` — the order the export has to flip. */
const createWaypoint = (
  lnglat: [number, number],
  { selected = true }: { selected?: boolean } = {}
): ActiveWaypoint => ({
  title: `${lnglat[0].toString()}/${lnglat[1].toString()}`,
  selected,
  displaylnglat: lnglat,
  key: 0,
  addressindex: 0,
});

const asWaypoints = (geocodeResults: ActiveWaypoint[]): Waypoint[] =>
  geocodeResults.map((geocodeResult, index) => ({
    id: index.toString(),
    userInput: geocodeResult.title,
    geocodeResults: [geocodeResult],
  }));

const BERLIN: [number, number] = [13.404954, 52.520008];
const MUNICH: [number, number] = [11.576124, 48.137154];

/**
 * `userEvent.setup()` installs its own clipboard stub, so the spy has to be
 * attached afterwards to survive.
 */
const setupWithClipboard = (
  writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue()
) => {
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: { writeText },
  });
  return { user, writeText };
};

describe('formatWaypointExport', () => {
  it('should emit unixtimestamp,start_lat,start_lon,end_lat,end_lon', () => {
    expect(
      formatWaypointExport(
        createWaypoint(BERLIN),
        createWaypoint(MUNICH),
        1700000000
      )
    ).toBe('1700000000,52.520008,13.404954,48.137154,11.576124');
  });

  it('should put latitude first even though coordinates are stored [lng, lat]', () => {
    const exported = formatWaypointExport(
      createWaypoint(BERLIN),
      createWaypoint(MUNICH),
      1700000000
    );
    const [, startLat, startLon, endLat, endLon] = exported.split(',');

    expect(startLat).toBe('52.520008');
    expect(startLon).toBe('13.404954');
    expect(endLat).toBe('48.137154');
    expect(endLon).toBe('11.576124');

    // The swapped output is still a plausible-looking coordinate list, so it is
    // worth asserting against explicitly.
    expect(exported).not.toBe(
      '1700000000,13.404954,52.520008,11.576124,48.137154'
    );
  });

  it('should pad every coordinate to six decimals', () => {
    expect(
      formatWaypointExport(
        createWaypoint([1.5, 2.25]),
        createWaypoint([-3, 4]),
        1
      )
    ).toBe('1,2.250000,1.500000,4.000000,-3.000000');
  });

  it('should round coordinates to six decimals', () => {
    expect(
      formatWaypointExport(
        createWaypoint([13.4049547891, 52.5200081234]),
        createWaypoint([0, 0]),
        1700000000
      )
    ).toBe('1700000000,52.520008,13.404955,0.000000,0.000000');
  });

  it('should keep the sign of southern and western coordinates', () => {
    expect(
      formatWaypointExport(
        createWaypoint([-58.381592, -34.603722]),
        createWaypoint([151.20929, -33.86882]),
        42
      )
    ).toBe('42,-34.603722,-58.381592,-33.868820,151.209290');
  });

  it('should place the timestamp first, unformatted', () => {
    const exported = formatWaypointExport(
      createWaypoint(BERLIN),
      createWaypoint(MUNICH),
      1700000000
    );

    expect(exported.split(',')[0]).toBe('1700000000');
    expect(exported.split(',')).toHaveLength(5);
  });
});

describe('ExportWaypointsButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWaypoints = asWaypoints([
      createWaypoint(BERLIN),
      createWaypoint(MUNICH),
    ]);
    vi.spyOn(Date, 'now').mockReturnValue(1700000000123);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render without crashing', () => {
    expect(() => render(<ExportWaypointsButton />)).not.toThrow();
  });

  it('should render the export button', () => {
    render(<ExportWaypointsButton />);

    const button = screen.getByTestId('export-waypoints-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Copy Start / Destination');
  });

  it('should be disabled without any waypoints', () => {
    mockWaypoints = [];
    render(<ExportWaypointsButton />);

    expect(screen.getByTestId('export-waypoints-button')).toBeDisabled();
  });

  it('should be disabled with a single active waypoint', () => {
    mockWaypoints = asWaypoints([createWaypoint(BERLIN)]);
    render(<ExportWaypointsButton />);

    expect(screen.getByTestId('export-waypoints-button')).toBeDisabled();
  });

  it('should be disabled when only one waypoint has a selected geocode result', () => {
    mockWaypoints = asWaypoints([
      createWaypoint(BERLIN),
      createWaypoint(MUNICH, { selected: false }),
    ]);
    render(<ExportWaypointsButton />);

    expect(screen.getByTestId('export-waypoints-button')).toBeDisabled();
  });

  it('should be enabled with two active waypoints', () => {
    render(<ExportWaypointsButton />);

    expect(screen.getByTestId('export-waypoints-button')).toBeEnabled();
  });

  it('should write the formatted line to the clipboard', async () => {
    const { user, writeText } = setupWithClipboard();
    render(<ExportWaypointsButton />);

    await user.click(screen.getByTestId('export-waypoints-button'));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(
      '1700000000,52.520008,13.404954,48.137154,11.576124'
    );
  });

  it('should stamp the export with Date.now() floored to whole seconds', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1699999999999);
    const { user, writeText } = setupWithClipboard();
    render(<ExportWaypointsButton />);

    await user.click(screen.getByTestId('export-waypoints-button'));

    // 1699999999999ms is 1699999999.999s — floored, never rounded up.
    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/^1699999999,/)
    );
  });

  it('should export the first and last active waypoint, dropping the vias', async () => {
    mockWaypoints = asWaypoints([
      createWaypoint(BERLIN),
      createWaypoint([9.993682, 53.551086]),
      createWaypoint(MUNICH),
    ]);
    const { user, writeText } = setupWithClipboard();
    render(<ExportWaypointsButton />);

    await user.click(screen.getByTestId('export-waypoints-button'));

    expect(writeText).toHaveBeenCalledWith(
      '1700000000,52.520008,13.404954,48.137154,11.576124'
    );
  });

  it('should show "Copied!" after a successful copy', async () => {
    const { user } = setupWithClipboard();
    render(<ExportWaypointsButton />);

    await user.click(screen.getByTestId('export-waypoints-button'));

    expect(await screen.findByText('Copied!')).toBeInTheDocument();
  });

  it('should catch a clipboard rejection instead of leaving it unhandled', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {
      /* keep the expected failure out of the test output */
    });
    const rejection = new Error('clipboard denied');
    const { user } = setupWithClipboard(
      vi.fn<(text: string) => Promise<void>>().mockRejectedValue(rejection)
    );
    render(<ExportWaypointsButton />);

    await expect(
      user.click(screen.getByTestId('export-waypoints-button'))
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      'Failed to copy waypoints:',
      rejection
    );
    expect(screen.queryByText('Copied!')).not.toBeInTheDocument();
    expect(screen.getByTestId('export-waypoints-button')).toHaveTextContent(
      'Copy Start / Destination'
    );
  });

  it('should not touch the clipboard while disabled', async () => {
    mockWaypoints = asWaypoints([createWaypoint(BERLIN)]);
    const { user, writeText } = setupWithClipboard();
    render(<ExportWaypointsButton />);

    await user.click(screen.getByTestId('export-waypoints-button'));

    expect(writeText).not.toHaveBeenCalled();
  });
});
