import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Maneuvers } from './maneuvers';
import type { Leg, Maneuver } from '@/components/types';
import type { TargetRef } from '@/utils/targets';

const mockHighlightManeuver = vi.fn();
const mockZoomToManeuver = vi.fn();

vi.mock('@/stores/directions-store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/stores/directions-store')>();
  return {
    ...actual,
    useDirectionsStore: vi.fn((selector) =>
      selector({
        highlightManeuver: mockHighlightManeuver,
        zoomToManeuver: mockZoomToManeuver,
      })
    ),
  };
});

const localCar: TargetRef = { instanceId: 'local', profile: 'car' };
const publicCar: TargetRef = { instanceId: 'public', profile: 'car' };

const createMockManeuver = (overrides: Partial<Maneuver> = {}): Maneuver => ({
  type: 1,
  instruction: 'Turn left onto Main Street',
  verbal_pre_transition_instruction: 'Turn left',
  time: 120,
  length: 0.5,
  cost: 50,
  begin_shape_index: 0,
  end_shape_index: 10,
  travel_mode: 'drive',
  travel_type: 'car',
  ...overrides,
});

const createMockLeg = (maneuvers: Maneuver[]): Leg => ({
  maneuvers,
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
  shape: 'encoded_shape',
});

/** The row element that carries the hover / click handlers. */
const maneuverRow = (instruction: string) =>
  screen.getByText(instruction).parentElement?.parentElement;

describe('Maneuvers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const legs = [createMockLeg([createMockManeuver()])];
    expect(() =>
      render(<Maneuvers legs={legs} target={localCar} index={0} />)
    ).not.toThrow();
  });

  it('should display maneuver instruction', () => {
    const legs = [
      createMockLeg([
        createMockManeuver({ instruction: 'Turn left onto Main Street' }),
      ]),
    ];
    render(<Maneuvers legs={legs} target={localCar} index={0} />);

    expect(screen.getByText('Turn left onto Main Street')).toBeInTheDocument();
  });

  it('should display multiple maneuvers', () => {
    const legs = [
      createMockLeg([
        createMockManeuver({ instruction: 'Start on First Avenue' }),
        createMockManeuver({ instruction: 'Turn right onto Second Street' }),
        createMockManeuver({ instruction: 'Arrive at destination' }),
      ]),
    ];
    render(<Maneuvers legs={legs} target={localCar} index={0} />);

    expect(screen.getByText('Start on First Avenue')).toBeInTheDocument();
    expect(
      screen.getByText('Turn right onto Second Street')
    ).toBeInTheDocument();
    expect(screen.getByText('Arrive at destination')).toBeInTheDocument();
  });

  it('should display length in meters for short distances', () => {
    const legs = [
      createMockLeg([createMockManeuver({ length: 0.15, type: 1 })]),
    ];
    render(<Maneuvers legs={legs} target={localCar} index={0} />);

    expect(screen.getByText('150m')).toBeInTheDocument();
  });

  it('should display length in km for longer distances', () => {
    const legs = [
      createMockLeg([createMockManeuver({ length: 2.5, type: 1 })]),
    ];
    render(<Maneuvers legs={legs} target={localCar} index={0} />);

    expect(screen.getByText('2.50km')).toBeInTheDocument();
  });

  it('should not display length/time for destination maneuvers (type 4, 5, 6)', () => {
    const legs = [
      createMockLeg([
        createMockManeuver({
          type: 4,
          instruction: 'Arrive at destination',
          length: 0,
        }),
      ]),
    ];
    render(<Maneuvers legs={legs} target={localCar} index={0} />);

    expect(screen.getByText('Arrive at destination')).toBeInTheDocument();
    expect(screen.queryByText('Length')).not.toBeInTheDocument();
    expect(screen.queryByText('Time')).not.toBeInTheDocument();
  });

  it('should display toll indicator when maneuver has toll', () => {
    const legs = [createMockLeg([createMockManeuver({ toll: true })])];
    render(<Maneuvers legs={legs} target={localCar} index={0} />);

    expect(screen.getByText('Toll')).toBeInTheDocument();
  });

  it('should display ferry indicator when maneuver has ferry', () => {
    const legs = [createMockLeg([createMockManeuver({ ferry: true })])];
    render(<Maneuvers legs={legs} target={localCar} index={0} />);

    expect(screen.getByText('Ferry')).toBeInTheDocument();
  });

  it('should call highlightManeuver on mouse enter', async () => {
    const user = userEvent.setup();
    const legs = [
      createMockLeg([
        createMockManeuver({
          begin_shape_index: 5,
          end_shape_index: 15,
        }),
      ]),
    ];
    render(<Maneuvers legs={legs} target={localCar} index={0} />);

    await user.hover(maneuverRow('Turn left onto Main Street')!);

    expect(mockHighlightManeuver).toHaveBeenCalledWith({
      startIndex: 5,
      endIndex: 15,
      instanceId: 'local',
      profile: 'car',
      index: 0,
    });
  });

  it('should call highlightManeuver on mouse leave', async () => {
    const user = userEvent.setup();
    const legs = [
      createMockLeg([
        createMockManeuver({
          begin_shape_index: 5,
          end_shape_index: 15,
        }),
      ]),
    ];
    render(<Maneuvers legs={legs} target={localCar} index={0} />);

    const row = maneuverRow('Turn left onto Main Street')!;
    await user.hover(row);
    await user.unhover(row);

    expect(mockHighlightManeuver).toHaveBeenCalledTimes(2);
  });

  it('should call zoomToManeuver on click', async () => {
    const user = userEvent.setup();
    vi.spyOn(Date, 'now').mockReturnValue(1234567890);

    const legs = [
      createMockLeg([
        createMockManeuver({
          begin_shape_index: 5,
        }),
      ]),
    ];
    render(<Maneuvers legs={legs} target={localCar} index={0} />);

    await user.click(maneuverRow('Turn left onto Main Street')!);

    expect(mockZoomToManeuver).toHaveBeenCalledWith({
      index: 5,
      timeNow: 1234567890,
    });
  });

  it('should handle multiple legs with correct start indices', () => {
    const legs = [
      createMockLeg([
        createMockManeuver({
          instruction: 'First leg maneuver',
          begin_shape_index: 0,
          end_shape_index: 50,
        }),
      ]),
      createMockLeg([
        createMockManeuver({
          instruction: 'Second leg maneuver',
          begin_shape_index: 0,
          end_shape_index: 30,
        }),
      ]),
    ];
    render(<Maneuvers legs={legs} target={localCar} index={0} />);

    expect(screen.getByText('First leg maneuver')).toBeInTheDocument();
    expect(screen.getByText('Second leg maneuver')).toBeInTheDocument();
  });

  it('should offset the second leg by the first leg shape indices', async () => {
    const user = userEvent.setup();
    const legs = [
      createMockLeg([
        createMockManeuver({
          instruction: 'First leg maneuver',
          begin_shape_index: 0,
          end_shape_index: 50,
        }),
      ]),
      createMockLeg([
        createMockManeuver({
          instruction: 'Second leg maneuver',
          begin_shape_index: 2,
          end_shape_index: 30,
        }),
      ]),
    ];
    render(<Maneuvers legs={legs} target={localCar} index={0} />);

    await user.hover(maneuverRow('Second leg maneuver')!);

    expect(mockHighlightManeuver).toHaveBeenCalledWith({
      startIndex: 52,
      endIndex: 80,
      instanceId: 'local',
      profile: 'car',
      index: 0,
    });
  });

  it('should pass alternate index to highlightManeuver', async () => {
    const user = userEvent.setup();
    const legs = [
      createMockLeg([
        createMockManeuver({
          begin_shape_index: 0,
          end_shape_index: 10,
        }),
      ]),
    ];
    render(<Maneuvers legs={legs} target={localCar} index={2} />);

    await user.hover(maneuverRow('Turn left onto Main Street')!);

    expect(mockHighlightManeuver).toHaveBeenCalledWith({
      startIndex: 0,
      endIndex: 10,
      instanceId: 'local',
      profile: 'car',
      index: 2,
    });
  });

  it('should pass the owning profile to highlightManeuver', async () => {
    const user = userEvent.setup();
    const legs = [
      createMockLeg([
        createMockManeuver({
          begin_shape_index: 3,
          end_shape_index: 7,
        }),
      ]),
    ];
    render(
      <Maneuvers
        legs={legs}
        target={{ instanceId: 'local', profile: 'emergency' }}
        index={0}
      />
    );

    await user.hover(maneuverRow('Turn left onto Main Street')!);

    expect(mockHighlightManeuver).toHaveBeenCalledWith({
      startIndex: 3,
      endIndex: 7,
      instanceId: 'local',
      profile: 'emergency',
      index: 0,
    });
  });

  it('should pass the owning instance to highlightManeuver', async () => {
    const user = userEvent.setup();
    const legs = [
      createMockLeg([
        createMockManeuver({
          begin_shape_index: 3,
          end_shape_index: 7,
        }),
      ]),
    ];
    render(<Maneuvers legs={legs} target={publicCar} index={0} />);

    await user.hover(maneuverRow('Turn left onto Main Street')!);

    // Same profile as `localCar` — only the instance tells the two apart, and
    // highlighting the wrong one would light up the other server's line.
    expect(mockHighlightManeuver).toHaveBeenCalledWith({
      startIndex: 3,
      endIndex: 7,
      instanceId: 'public',
      profile: 'car',
      index: 0,
    });
  });
});
