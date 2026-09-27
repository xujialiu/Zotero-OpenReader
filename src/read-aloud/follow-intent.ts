/** A reader tab owns its choice independently of reading sessions and settings changes. */
export interface FollowIntent { automatic: boolean }
export function createFollowIntents(defaultAutomatic: () => boolean = () => true) {
  const readers = new WeakMap<object, FollowIntent>();
  return {
    get(reader: object): FollowIntent {
      let intent = readers.get(reader);
      if (!intent) { intent = { automatic: defaultAutomatic() }; readers.set(reader, intent); }
      return intent;
    },
  };
}
export type FollowIntents = ReturnType<typeof createFollowIntents>;
