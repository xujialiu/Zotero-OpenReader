export type SynthesisErrorKind =
  | 'no-key'
  /** The server answered 401/403: the key is wrong, expired, or not authorised. */
  | 'auth'
  | 'network'
  | 'local-server-down'
  | 'rate-limit'
  | 'quota'
  | 'decode-failed'
  /** Fish Audio's free model is no longer free, or that could not be confirmed (issue #181): nothing was asked for. */
  | 'model-not-free'
  /** Fish Audio no longer offers the chosen model, or that could not be confirmed (issue #181): nothing was asked for. */
  | 'model-gone'
  | 'unknown';

const RETRIABLE: ReadonlySet<SynthesisErrorKind> = new Set([
  'network',
  'rate-limit',
  'local-server-down',
]);

export class SynthesisError extends Error {
  readonly kind: SynthesisErrorKind;
  readonly retriable: boolean;

  constructor(kind: SynthesisErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'SynthesisError';
    this.kind = kind;
    this.retriable = RETRIABLE.has(kind);
  }
}

/**
 * Collapse down to the error strings the native Zotero Read Aloud UI
 * recognizes (syncAPIClient.js:715-733). Details are logged separately
 * by the caller — some information loss here is unavoidable, because
 * the native UI's vocabulary is only this large.
 */
export function toZoteroError(e: unknown): 'network' | 'quota-exceeded' | 'model-not-free' | 'model-gone' | 'unknown' {
  if (!(e instanceof SynthesisError)) return 'unknown';
  switch (e.kind) {
    // The plugin's own Player words these (issue #181); Zotero has no such strings
    case 'model-not-free':
    case 'model-gone':
      return e.kind;
    case 'network':
    case 'local-server-down':
      return 'network';
    case 'quota':
    case 'rate-limit':
      return 'quota-exceeded';
    default:
      return 'unknown';
  }
}
