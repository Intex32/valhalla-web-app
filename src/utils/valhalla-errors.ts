/**
 * Valhalla's code for "this server has no such costing model" — what you get
 * asking a stock build for our fork-only `emergency` profile. It is the one
 * failure that means "wrong server", not "bad request", so it drives the
 * unsupported-profile banner rather than a generic error toast.
 */
export const NO_COSTING_METHOD_ERROR_CODE = 125;

export interface ValhallaRequestError {
  kind: 'unsupported' | 'error';
  message: string;
}

/** Reads a Valhalla error body into a classified failure. */
export const classifyValhallaError = (
  body: { error_code?: number; error?: string } | null,
  fallbackMessage: string
): ValhallaRequestError => ({
  kind:
    body?.error_code === NO_COSTING_METHOD_ERROR_CODE ? 'unsupported' : 'error',
  message: body?.error ?? fallbackMessage,
});

/** Turns a thrown value into a classified failure. */
export const toRequestError = (
  reason: unknown,
  fallbackMessage: string
): ValhallaRequestError => {
  if (reason instanceof ValhallaError) {
    return { kind: reason.kind, message: reason.message };
  }
  return {
    kind: 'error',
    message: reason instanceof Error ? reason.message : fallbackMessage,
  };
};

/** Error carrying Valhalla's own classification through a rejected promise. */
export class ValhallaError extends Error {
  readonly kind: 'unsupported' | 'error';

  constructor({ kind, message }: ValhallaRequestError) {
    super(message);
    this.name = 'ValhallaError';
    this.kind = kind;
  }
}
