import { z } from 'zod';

// The app routes against a list of instances now (see stores/instances-store).
// What is left here are the per-URL helpers that list uses.

const baseUrlSchema = z
  .string()
  .trim()
  .min(1, 'URL cannot be empty')
  .url('Invalid URL format')
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    },
    { message: 'URL must use HTTP or HTTPS protocol' }
  );

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

export function validateBaseUrl(url: string): UrlValidationResult {
  const result = baseUrlSchema.safeParse(url);

  if (result.success) {
    return { valid: true };
  }

  return { valid: false, error: result.error.errors[0]?.message };
}

export function normalizeBaseUrl(url: string): string {
  const trimmedUrl = url.trim();

  if (trimmedUrl.endsWith('/')) {
    return trimmedUrl.slice(0, -1);
  }

  return trimmedUrl;
}

export interface ConnectionTestResult {
  reachable: boolean;
  error?: string;
}

interface ValhallaStatusResponse {
  version?: string;
  available_actions?: string[];
}

export async function testConnection(
  url: string
): Promise<ConnectionTestResult> {
  const validation = validateBaseUrl(url);
  if (!validation.valid) {
    return { reachable: false, error: validation.error };
  }

  const normalizedUrl = normalizeBaseUrl(url);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${normalizedUrl}/status`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        reachable: false,
        error: `Server returned status ${response.status}`,
      };
    }

    let data: ValhallaStatusResponse;
    try {
      data = await response.json();
    } catch {
      return { reachable: false, error: 'Invalid response format' };
    }

    if (!data.available_actions || !Array.isArray(data.available_actions)) {
      return { reachable: false, error: 'Not a valid Valhalla server' };
    }

    const requiredActions = ['route', 'isochrone'];
    const hasRequiredActions = requiredActions.every((action) =>
      data.available_actions!.includes(action)
    );

    if (!hasRequiredActions) {
      return {
        reachable: false,
        error: 'Server missing required actions (route, isochrone)',
      };
    }

    return { reachable: true };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { reachable: false, error: 'Connection timeout' };
      }
      return { reachable: false, error: 'Server unreachable' };
    }
    return { reachable: false, error: 'Connection failed' };
  }
}
