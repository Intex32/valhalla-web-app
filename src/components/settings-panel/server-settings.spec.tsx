import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useInstancesStore,
  type ValhallaInstance,
} from '@/stores/instances-store';
import { ServerSettings } from './server-settings';

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

const renderWithQueryClient = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      {ui}
    </QueryClientProvider>
  );

/** Expands the collapsible so the instance rows are mounted. */
const openSection = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByText('Server Settings'));
};

const reachableResponse = () => ({
  ok: true,
  status: 200,
  json: () =>
    Promise.resolve({
      version: '3.5.1',
      available_actions: ['route', 'isochrone'],
    }),
});

describe('ServerSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useInstancesStore.setState({
      instances: [{ ...PUBLIC_INSTANCE }, { ...LOCAL_INSTANCE }],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(reachableResponse() as unknown as Response))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('should render the section header with the instance count', () => {
    renderWithQueryClient(<ServerSettings />);

    expect(screen.getByText('Server Settings')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('should keep the rows collapsed until the section is opened', () => {
    renderWithQueryClient(<ServerSettings />);
    expect(screen.queryByTestId('instance-public')).not.toBeInTheDocument();
  });

  it('should list one row per instance when expanded', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ServerSettings />);

    await openSection(user);

    expect(screen.getByTestId('instance-public')).toBeInTheDocument();
    expect(screen.getByTestId('instance-local')).toBeInTheDocument();
  });

  it('should show each instance name and base URL', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ServerSettings />);

    await openSection(user);

    expect(
      screen.getByLabelText('Name', { selector: '#instance-label-public' })
    ).toHaveValue('Public');
    expect(
      screen.getByLabelText('Base URL', { selector: '#instance-url-public' })
    ).toHaveValue(PUBLIC_INSTANCE.url);
    expect(
      screen.getByLabelText('Base URL', { selector: '#instance-url-local' })
    ).toHaveValue(LOCAL_INSTANCE.url);
  });

  it('should rename an instance on blur without touching its id', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ServerSettings />);

    await openSection(user);
    const nameInput = screen.getByLabelText('Name', {
      selector: '#instance-label-local',
    });
    await user.clear(nameInput);
    await user.type(nameInput, 'Staging');
    await user.tab();

    const { instances } = useInstancesStore.getState();
    expect(instances[1]).toEqual({ ...LOCAL_INSTANCE, label: 'Staging' });
  });

  it('should fall back to the id when the name is cleared', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ServerSettings />);

    await openSection(user);
    const nameInput = screen.getByLabelText('Name', {
      selector: '#instance-label-local',
    });
    await user.clear(nameInput);
    await user.tab();

    expect(useInstancesStore.getState().instances[1]?.label).toBe('local');
  });

  it('should not save while the URL is still being typed', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ServerSettings />);

    await openSection(user);
    const urlInput = screen.getByLabelText('Base URL', {
      selector: '#instance-url-local',
    });
    await user.clear(urlInput);
    await user.type(urlInput, 'https://new.valhalla.com');

    expect(useInstancesStore.getState().instances[1]?.url).toBe(
      LOCAL_INSTANCE.url
    );
  });

  it('should store a reachable URL on blur', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ServerSettings />);

    await openSection(user);
    const urlInput = screen.getByLabelText('Base URL', {
      selector: '#instance-url-local',
    });
    await user.clear(urlInput);
    await user.type(urlInput, 'https://new.valhalla.com/');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText('Reachable')).toBeInTheDocument();
    });
    // The trailing slash is normalized away before it is stored.
    expect(useInstancesStore.getState().instances[1]?.url).toBe(
      'https://new.valhalla.com'
    );
  });

  it('should report an unreachable server without storing the URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('boom')))
    );
    const user = userEvent.setup();
    renderWithQueryClient(<ServerSettings />);

    await openSection(user);
    const urlInput = screen.getByLabelText('Base URL', {
      selector: '#instance-url-local',
    });
    await user.clear(urlInput);
    await user.type(urlInput, 'https://down.valhalla.com');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText('Server unreachable')).toBeInTheDocument();
    });
    expect(useInstancesStore.getState().instances[1]?.url).toBe(
      LOCAL_INSTANCE.url
    );
  });

  it('should show an error for an invalid URL format on blur', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ServerSettings />);

    await openSection(user);
    const urlInput = screen.getByLabelText('Base URL', {
      selector: '#instance-url-local',
    });
    await user.clear(urlInput);
    await user.type(urlInput, 'not-a-valid-url');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText('Invalid URL format')).toBeInTheDocument();
    });
    expect(urlInput).toHaveAttribute('aria-invalid', 'true');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should show an error for a non-http protocol on blur', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ServerSettings />);

    await openSection(user);
    const urlInput = screen.getByLabelText('Base URL', {
      selector: '#instance-url-local',
    });
    await user.clear(urlInput);
    await user.type(urlInput, 'ftp://example.com');
    await user.tab();

    await waitFor(() => {
      expect(
        screen.getByText('URL must use HTTP or HTTPS protocol')
      ).toBeInTheDocument();
    });
  });

  it('should clear the error as soon as the user types again', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ServerSettings />);

    await openSection(user);
    const urlInput = screen.getByLabelText('Base URL', {
      selector: '#instance-url-local',
    });
    await user.clear(urlInput);
    await user.type(urlInput, 'invalid');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText('Invalid URL format')).toBeInTheDocument();
    });

    await user.type(urlInput, 'https://valid.com');

    await waitFor(() => {
      expect(screen.queryByText('Invalid URL format')).not.toBeInTheDocument();
    });
  });

  it('should add an instance', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ServerSettings />);

    await openSection(user);
    await user.click(screen.getByTestId('add-instance-button'));

    const { instances } = useInstancesStore.getState();
    expect(instances).toHaveLength(3);
    expect(instances[2]?.id).toBe('instance-3');
    expect(screen.getByTestId('instance-instance-3')).toBeInTheDocument();
  });

  it('should remove an instance', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ServerSettings />);

    await openSection(user);
    await user.click(screen.getByTestId('remove-instance-local'));

    expect(useInstancesStore.getState().instances).toEqual([PUBLIC_INSTANCE]);
    expect(screen.queryByTestId('instance-local')).not.toBeInTheDocument();
  });

  it('should not let the last instance be removed', async () => {
    const user = userEvent.setup();
    useInstancesStore.setState({ instances: [{ ...PUBLIC_INSTANCE }] });
    renderWithQueryClient(<ServerSettings />);

    await openSection(user);
    const removeButton = screen.getByTestId('remove-instance-public');

    expect(removeButton).toBeDisabled();
    expect(useInstancesStore.getState().instances).toHaveLength(1);
  });

  it('should keep instance ids unique when labels collide', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ServerSettings />);

    await openSection(user);
    await user.click(screen.getByTestId('add-instance-button'));
    await user.click(screen.getByTestId('add-instance-button'));

    const ids = useInstancesStore.getState().instances.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
