/**
 * The lab's keyboard shortcuts in one table. Handlers (`useLabAudio.ts`, `plan.ts`) and the help text (`{key:name}` in
 * `texts.ts` entries) both read it, and `texts.test.ts` fails when an entry names a key that is not here or says a key
 * that disagrees with it. Other handlers move over as their panels' entries are converted.
 */
export const SHORTCUTS = {
  /** Switches mode playback between Parallel and Relative. */
  modePlayback: '0',
  /** Hold: play what the pointer is on, as listed. */
  holdOwn: '1',
  /** Hold: the pure (target) pitch. */
  holdPure: '2',
  /** Hold: listed and pure together. */
  holdBoth: '3',
  /** Hold: the armed chord in Field mode on the pointed note. */
  holdField: '4',
  /** Hold: the armed chord with its exact ratios on the pointed note. */
  holdExact: '5',
  /** Melody keys down by one repeat (`keymap.ts` `shiftOfEvent`, by physical key first). */
  shiftDown: ',',
  /** Melody keys up by one repeat. */
  shiftUp: '.',
  /** Shelf page back (`keymap.ts` `pageOfEvent`). */
  pageBack: '[',
  /** Shelf page forward. */
  pageNext: ']',
  /** Stashes the current Sketch on the shelf (`useLabAudio.ts`; `+`, the same physical key, does too). */
  stash: '=',
  /** Opens the composite popup on what the pointer is on (`Send.tsx`); closes it again while open. */
  composite: '-',
  /** In the composite popup: flips the slider; the handler accepts e or E. */
  sendFlip: 'E',
} as const;

export type ShortcutName = keyof typeof SHORTCUTS;

/** The key for a name, or undefined for an unknown one (the renderer shows the markup as plain text then). */
export function shortcutKey(name: string): string | undefined {
  return Object.hasOwn(SHORTCUTS, name) ? SHORTCUTS[name as ShortcutName] : undefined;
}
