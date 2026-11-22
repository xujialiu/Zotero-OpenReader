import { WebDAVError } from '../core/webdav';
import type { PositionsClient } from './position-transport';

interface PositionFileCopy {
  name: string;
  text: string | null;
}

/** Read both names before either is changed. Only a 404 means an absent copy. */
export function downloadPositionCopies(client: PositionsClient, names: readonly string[]): Promise<PositionFileCopy[]> {
  return Promise.all(names.map(async (name) => {
    try {
      return { name, text: await client.download(name) };
    } catch (error) {
      if (error instanceof WebDAVError && error.kind === 'not-found') return { name, text: null };
      throw error;
    }
  }));
}

/** A failed PUT leaves the next run to read both copies again before repairing the difference. */
export async function uploadPositionCopies(
  client: PositionsClient, copies: PositionFileCopy[], text: string, hasItems: boolean,
): Promise<boolean> {
  let uploaded = false;
  for (const copy of copies) {
    if (copy.text === text || (copy.text === null && !hasItems)) continue;
    await client.upload(copy.name, text);
    uploaded = true;
  }
  return uploaded;
}
