/**
 * Reject a promise that takes too long. Every request the plugin makes goes
 * through here, because a request that never settles shows up in Zotero as
 * a spinner that never stops — the user cannot tell a slow server from a
 * dead one. `onTimeout` lets the caller abort the underlying request so it
 * does not keep running in the background. It runs after the deadline's own
 * rejection, so a request that the abort rejects at once (an aborted fetch's
 * AbortError) still fails with the caller's error (#169).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, makeError: () => Error, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(makeError());
      try {
        onTimeout?.();
      } catch {
        // Aborting is best-effort; the rejection above is what matters
      }
    }, ms);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}
