import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomStylesDialog } from './custom-styles-dialog';

const mockLocalStorage: Record<string, string> = {};

vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockLocalStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockLocalStorage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockLocalStorage).forEach(
      (key) => delete mockLocalStorage[key]
    );
  }),
});

describe('CustomStylesDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockLocalStorage).forEach(
      (key) => delete mockLocalStorage[key]
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render trigger button', () => {
    render(<CustomStylesDialog />);

    expect(
      screen.getByRole('button', { name: 'Load custom styles' })
    ).toBeInTheDocument();
  });

  it('should open dialog when trigger is clicked', async () => {
    const user = userEvent.setup();

    render(<CustomStylesDialog />);

    await user.click(
      screen.getByRole('button', { name: 'Load custom styles' })
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Custom styles')).toBeInTheDocument();
  });

  it('should display dialog description', async () => {
    const user = userEvent.setup();

    render(<CustomStylesDialog />);

    await user.click(
      screen.getByRole('button', { name: 'Load custom styles' })
    );

    expect(
      screen.getByText(/point the map at any MapLibre style\.json by URL/i)
    ).toBeInTheDocument();
  });

  it('should have URL input field', async () => {
    const user = userEvent.setup();

    render(<CustomStylesDialog />);

    await user.click(
      screen.getByRole('button', { name: 'Load custom styles' })
    );

    expect(screen.getByLabelText('Style URL')).toBeInTheDocument();
  });

  it('should have Load button', async () => {
    const user = userEvent.setup();

    render(<CustomStylesDialog />);

    await user.click(
      screen.getByRole('button', { name: 'Load custom styles' })
    );

    expect(screen.getByRole('button', { name: 'Load' })).toBeInTheDocument();
  });

  it('should have Choose file button', async () => {
    const user = userEvent.setup();

    render(<CustomStylesDialog />);

    await user.click(
      screen.getByRole('button', { name: 'Load custom styles' })
    );

    expect(
      screen.getByRole('button', { name: 'Choose file' })
    ).toBeInTheDocument();
  });

  it('should show error for invalid URL', async () => {
    const user = userEvent.setup();

    render(<CustomStylesDialog />);

    await user.click(
      screen.getByRole('button', { name: 'Load custom styles' })
    );
    await user.type(screen.getByLabelText('Style URL'), 'not-a-url');
    await user.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(
        screen.getByText('Enter an absolute URL, or a path starting with /')
      ).toBeInTheDocument();
    });
  });

  it('should clear error when typing in URL input', async () => {
    const user = userEvent.setup();

    render(<CustomStylesDialog />);

    await user.click(
      screen.getByRole('button', { name: 'Load custom styles' })
    );
    await user.type(screen.getByLabelText('Style URL'), 'not-a-url');
    await user.click(screen.getByRole('button', { name: 'Load' }));

    const errorText = 'Enter an absolute URL, or a path starting with /';
    await waitFor(() => {
      expect(screen.getByText(errorText)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Style URL'), 'https://');

    await waitFor(() => {
      expect(screen.queryByText(errorText)).not.toBeInTheDocument();
    });
  });

  it('should report the URL and style name on successful URL fetch', async () => {
    const user = userEvent.setup();
    const onStyleUrlLoaded = vi.fn();
    const mockStyle = {
      version: 8,
      name: 'Test Style',
      sources: {},
      layers: [],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStyle),
    });

    render(<CustomStylesDialog onStyleUrlLoaded={onStyleUrlLoaded} />);

    await user.click(
      screen.getByRole('button', { name: 'Load custom styles' })
    );
    await user.type(
      screen.getByLabelText('Style URL'),
      'https://example.com/style.json'
    );
    await user.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(onStyleUrlLoaded).toHaveBeenCalledWith(
        'https://example.com/style.json',
        'Test Style'
      );
    });
  });

  it('should store the URL rather than a snapshot of the style', async () => {
    const user = userEvent.setup();
    const mockStyle = {
      version: 8,
      name: 'Test Style',
      sources: {},
      layers: [],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStyle),
    });

    render(<CustomStylesDialog />);

    await user.click(
      screen.getByRole('button', { name: 'Load custom styles' })
    );
    await user.type(
      screen.getByLabelText('Style URL'),
      'https://example.com/style.json'
    );
    await user.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'selectedMapStyle',
        'custom'
      );
    });

    expect(mockLocalStorage['customMapStyleUrl']).toBe(
      'https://example.com/style.json'
    );
    expect(mockLocalStorage['customMapStyleName']).toBe('Test Style');
    expect(mockLocalStorage['customMapStyle']).toBeUndefined();
  });

  it('should accept a same-origin path', async () => {
    const user = userEvent.setup();
    const onStyleUrlLoaded = vi.fn();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: 8, sources: {}, layers: [] }),
    });

    render(<CustomStylesDialog onStyleUrlLoaded={onStyleUrlLoaded} />);

    await user.click(
      screen.getByRole('button', { name: 'Load custom styles' })
    );
    await user.type(screen.getByLabelText('Style URL'), '/styles/carto.json');
    await user.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(onStyleUrlLoaded).toHaveBeenCalledWith(
        '/styles/carto.json',
        undefined
      );
    });
  });

  it('should prefill the field with the style URL in use', async () => {
    const user = userEvent.setup();

    render(
      <CustomStylesDialog currentStyleUrl="https://example.com/in-use.json" />
    );

    await user.click(
      screen.getByRole('button', { name: 'Edit custom style URL' })
    );

    expect(screen.getByLabelText('Style URL')).toHaveValue(
      'https://example.com/in-use.json'
    );
  });

  it('should show error for invalid style format', async () => {
    const user = userEvent.setup();
    const invalidStyle = { invalid: 'format' };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(invalidStyle),
    });

    render(<CustomStylesDialog />);

    await user.click(
      screen.getByRole('button', { name: 'Load custom styles' })
    );
    await user.type(
      screen.getByLabelText('Style URL'),
      'https://example.com/style.json'
    );
    await user.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(
        screen.getByText('Invalid MapLibre style.json format')
      ).toBeInTheDocument();
    });
  });

  it('should show error on fetch failure', async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    render(<CustomStylesDialog />);

    await user.click(
      screen.getByRole('button', { name: 'Load custom styles' })
    );
    await user.type(
      screen.getByLabelText('Style URL'),
      'https://example.com/style.json'
    );
    await user.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(screen.getByText('HTTP 404: Not Found')).toBeInTheDocument();
    });
  });
});
