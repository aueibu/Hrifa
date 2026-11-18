/** What a dragged thing carries, so a drop target can say what it accepts: a pin, a chord, a set of notes. `type` is the vocabulary. */
export interface Payload<T = unknown> {
  type: string;
  data: T;
}

/** Whether a drop target that accepts `accepts` takes `payload`. An empty list accepts nothing. */
export const canAccept = (
  accepts: readonly string[],
  payload: Payload | null | undefined
): boolean => !!payload && accepts.includes(payload.type);
