import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { InstanceResultsGroup } from './instance-results-group';
import {
  useInstancesStore,
  type ValhallaInstance,
} from '@/stores/instances-store';
import type { Profile } from '@/stores/common-store';
import type { TargetRef } from '@/utils/targets';

interface TargetFailure {
  target: TargetRef;
  kind: 'unsupported' | 'error';
  message: string;
}

const PUBLIC: ValhallaInstance = {
  id: 'public',
  label: 'Public',
  url: 'https://valhalla1.openstreetmap.de',
};
const LOCAL: ValhallaInstance = {
  id: 'local',
  label: 'My Server',
  url: 'http://localhost:8002',
};

const failure = (
  instanceId: string,
  profile: Profile,
  kind: 'unsupported' | 'error'
): TargetFailure => ({
  target: { instanceId, profile },
  kind,
  message: kind === 'unsupported' ? 'No costing method found' : 'Network error',
});

describe('InstanceResultsGroup', () => {
  beforeEach(() => {
    useInstancesStore.setState({ instances: [PUBLIC, LOCAL] });
  });

  it('should render without crashing', () => {
    expect(() =>
      render(
        <InstanceResultsGroup instanceId="public" failures={[]}>
          <div />
        </InstanceResultsGroup>
      )
    ).not.toThrow();
  });

  it('should render the instance label and url', () => {
    render(
      <InstanceResultsGroup instanceId="local" failures={[]}>
        <div />
      </InstanceResultsGroup>
    );

    expect(screen.getByText('My Server')).toBeInTheDocument();
    expect(screen.getByText('http://localhost:8002')).toBeInTheDocument();
    // The url is truncated in the layout, so the full value lives in the title.
    expect(screen.getByTitle('http://localhost:8002')).toBeInTheDocument();
  });

  it('should key the group by instance id', () => {
    render(
      <InstanceResultsGroup instanceId="local" failures={[]}>
        <div />
      </InstanceResultsGroup>
    );

    expect(screen.getByTestId('instance-group-local')).toBeInTheDocument();
    expect(
      screen.queryByTestId('instance-group-public')
    ).not.toBeInTheDocument();
  });

  it('should render its children', () => {
    render(
      <InstanceResultsGroup instanceId="public" failures={[]}>
        <div data-testid="route-card">Route</div>
      </InstanceResultsGroup>
    );

    expect(
      within(screen.getByTestId('instance-group-public')).getByTestId(
        'route-card'
      )
    ).toBeInTheDocument();
  });

  it('should fall back to the id when the instance is unknown', () => {
    render(
      <InstanceResultsGroup instanceId="deleted" failures={[]}>
        <div />
      </InstanceResultsGroup>
    );

    expect(screen.getByTestId('instance-group-deleted')).toBeInTheDocument();
    expect(screen.getByText('deleted')).toBeInTheDocument();
  });

  it('should not render a banner without failures', () => {
    render(
      <InstanceResultsGroup instanceId="public" failures={[]}>
        <div />
      </InstanceResultsGroup>
    );

    expect(
      screen.queryByTestId('unsupported-banner-public')
    ).not.toBeInTheDocument();
  });

  it('should render a banner naming the unsupported profile', () => {
    render(
      <InstanceResultsGroup
        instanceId="public"
        failures={[failure('public', 'emergency', 'unsupported')]}
      >
        <div />
      </InstanceResultsGroup>
    );

    const banner = screen.getByTestId('unsupported-banner-public');
    expect(banner).toHaveTextContent(
      'Public has no costing model for Emergency'
    );
    // The profile label, not the raw costing name.
    expect(within(banner).getByText('Emergency')).toBeInTheDocument();
    expect(banner).toHaveTextContent('it was');
  });

  it('should list every unsupported profile in one banner', () => {
    render(
      <InstanceResultsGroup
        instanceId="public"
        failures={[
          failure('public', 'emergency', 'unsupported'),
          failure('public', 'motor_scooter', 'unsupported'),
        ]}
      >
        <div />
      </InstanceResultsGroup>
    );

    const banner = screen.getByTestId('unsupported-banner-public');
    expect(
      within(banner).getByText('Emergency, Motor Scooter')
    ).toBeInTheDocument();
    expect(banner).toHaveTextContent('they were');
  });

  it('should use the instance label in the banner', () => {
    render(
      <InstanceResultsGroup
        instanceId="local"
        failures={[failure('local', 'truck', 'unsupported')]}
      >
        <div />
      </InstanceResultsGroup>
    );

    expect(screen.getByTestId('unsupported-banner-local')).toHaveTextContent(
      'My Server has no costing model for Truck'
    );
  });

  it('should not render a banner for a plain error failure', () => {
    render(
      <InstanceResultsGroup
        instanceId="public"
        failures={[failure('public', 'car', 'error')]}
      >
        <div />
      </InstanceResultsGroup>
    );

    expect(
      screen.queryByTestId('unsupported-banner-public')
    ).not.toBeInTheDocument();
  });

  it('should ignore failures belonging to another instance', () => {
    render(
      <InstanceResultsGroup
        instanceId="public"
        failures={[failure('local', 'emergency', 'unsupported')]}
      >
        <div />
      </InstanceResultsGroup>
    );

    expect(
      screen.queryByTestId('unsupported-banner-public')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Emergency')).not.toBeInTheDocument();
  });

  it('should name only its own instance unsupported profiles in a mixed failure list', () => {
    const failures = [
      failure('public', 'emergency', 'unsupported'),
      failure('local', 'truck', 'unsupported'),
      failure('public', 'car', 'error'),
    ];

    const { unmount } = render(
      <InstanceResultsGroup instanceId="public" failures={failures}>
        <div />
      </InstanceResultsGroup>
    );

    const publicBanner = screen.getByTestId('unsupported-banner-public');
    expect(publicBanner).toHaveTextContent('Emergency');
    expect(publicBanner).not.toHaveTextContent('Truck');
    expect(publicBanner).not.toHaveTextContent('Car');
    unmount();

    render(
      <InstanceResultsGroup instanceId="local" failures={failures}>
        <div />
      </InstanceResultsGroup>
    );

    const localBanner = screen.getByTestId('unsupported-banner-local');
    expect(localBanner).toHaveTextContent('Truck');
    expect(localBanner).not.toHaveTextContent('Emergency');
  });

  it('should still render its children alongside a banner', () => {
    render(
      <InstanceResultsGroup
        instanceId="public"
        failures={[failure('public', 'emergency', 'unsupported')]}
      >
        <div data-testid="route-card">Route</div>
      </InstanceResultsGroup>
    );

    expect(screen.getByTestId('unsupported-banner-public')).toBeInTheDocument();
    expect(screen.getByTestId('route-card')).toBeInTheDocument();
  });
});
