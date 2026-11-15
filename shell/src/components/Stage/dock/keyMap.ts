/**
 * THE key map of the dock Stage: one table, so a key can change in one place. Every command that has a shortcut is here
 * with its label; menus show `keyLabel(command)`, the window handler in DockStage reads `matchCommand(event)`.
 *
 * Choices (design 4.4, O6):
 * - F6 / Shift+F6 cycle between dockers. F6 is a browser key (focus the address bar); a page that calls `preventDefault`
 *   on keydown normally wins, but this is UNVERIFIED for every browser, so "Go to docker" (Alt+G, a list by name, also
 *   in the Panels menu) is the route that always works.
 * - Alt+F6 / Alt+Shift+F6 cycle between the splitters (a splitter is a separate Tab stop; by Tab it is far away).
 * - Alt+1 .. Alt+9 jump to the nth docker in tree order. CONFLICT RISK: Alt+digit is browser-tab navigation in Chrome
 *   and Firefox on Linux (a page may not be able to override it; unverified). The tab Alt+Left / Alt+Right reorder keys
 *   collide with Back / Forward on Windows and Linux (the handler calls `preventDefault`; unverified). And the OLD spike's StageApp uses Alt+digit for its presets (the dock spike
 *   does not, and the two Stages are never on one page). The digits are matched by `code` (Digit1..Digit9), so a layout
 *   or macOS Option character does not matter.
 * - Alt+G: no default in Chrome or Edge. (Ctrl+Alt+G would be AltGr+G on layouts that have it.)
 */

export type DockCommand =
  | 'nextDocker'
  | 'prevDocker'
  | 'nextSplitter'
  | 'prevSplitter'
  | 'goToDocker'
  | `docker${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

/** A key combination: `key` (an `event.key`) or `code` (an `event.code`); modifiers must match exactly. */
export interface KeySpec {
  key?: string;
  code?: string;
  alt?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
}

const digit = (n: number): KeySpec => ({ code: `Digit${n}`, alt: true });

export const DOCK_KEYS: Readonly<Record<DockCommand, KeySpec>> = {
  nextDocker: { key: 'F6' },
  prevDocker: { key: 'F6', shift: true },
  nextSplitter: { key: 'F6', alt: true },
  prevSplitter: { key: 'F6', alt: true, shift: true },
  goToDocker: { code: 'KeyG', alt: true },
  docker1: digit(1),
  docker2: digit(2),
  docker3: digit(3),
  docker4: digit(4),
  docker5: digit(5),
  docker6: digit(6),
  docker7: digit(7),
  docker8: digit(8),
  docker9: digit(9),
};

export const DOCK_COMMAND_LABELS: Readonly<Record<DockCommand, string>> = {
  nextDocker: 'Next docker',
  prevDocker: 'Previous docker',
  nextSplitter: 'Next splitter',
  prevSplitter: 'Previous splitter',
  goToDocker: 'Go to docker...',
  docker1: 'Docker 1',
  docker2: 'Docker 2',
  docker3: 'Docker 3',
  docker4: 'Docker 4',
  docker5: 'Docker 5',
  docker6: 'Docker 6',
  docker7: 'Docker 7',
  docker8: 'Docker 8',
  docker9: 'Docker 9',
};

/** The docker number (1 to 9) a `dockerN` command jumps to, or null. */
export const dockerNumber = (cmd: DockCommand): number | null => {
  const m = /^docker([1-9])$/.exec(cmd);
  return m ? Number(m[1]) : null;
};

export const dockerCommandFor = (n: number): DockCommand | null =>
  n >= 1 && n <= 9 ? (`docker${n}` as DockCommand) : null;

export interface KeyEventLike {
  key: string;
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export function matchesKey(e: KeyEventLike, spec: KeySpec): boolean {
  if (
    e.altKey !== !!spec.alt ||
    e.ctrlKey !== !!spec.ctrl ||
    e.shiftKey !== !!spec.shift ||
    e.metaKey !== !!spec.meta
  ) {
    return false;
  }
  if (spec.code !== undefined) {
    return e.code === spec.code;
  }
  return spec.key !== undefined && e.key === spec.key;
}

/** The command a keydown is, or null. */
export function matchCommand(e: KeyEventLike): DockCommand | null {
  for (const cmd of Object.keys(DOCK_KEYS) as DockCommand[]) {
    if (matchesKey(e, DOCK_KEYS[cmd])) {
      return cmd;
    }
  }
  return null;
}

const codeName = (code: string): string => code.replace(/^Digit/, '').replace(/^Key/, '');

/** The text a menu shows beside a command, e.g. `Alt+1` or `Shift+F6`. */
export function keyLabel(cmd: DockCommand): string {
  const s = DOCK_KEYS[cmd];
  const parts: string[] = [];
  if (s.ctrl) {
    parts.push('Ctrl');
  }
  if (s.alt) {
    parts.push('Alt');
  }
  if (s.shift) {
    parts.push('Shift');
  }
  if (s.meta) {
    parts.push('Meta');
  }
  parts.push(s.code !== undefined ? codeName(s.code) : (s.key ?? ''));
  return parts.join('+');
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'number', 'password', 'url', 'tel']);

/** Typing targets: a shortcut never fires while the user types in one of these. */
export function isTypingTarget(el: Element | null): boolean {
  if (!el) {
    return false;
  }
  const tag = el.tagName;
  if (tag === 'INPUT') {
    // only text-like inputs are typing; a checkbox, radio, range or button input does not block shortcuts
    return TEXT_INPUT_TYPES.has((el.getAttribute('type') ?? 'text').toLowerCase());
  }
  return (
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

const OVERLAY_SELECTOR = '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]';

/** Is this overlay open and visible (not hidden, aria-hidden, display none or closed)? */
const isOpenOverlay = (el: Element): boolean => {
  if (el.closest('[hidden], [aria-hidden="true"], [inert], [data-state="closed"]')) {
    return false;
  }
  const style = (el as HTMLElement).style;
  return style.display !== 'none' && style.visibility !== 'hidden';
};

/**
 * An OPEN Mantine menu, a dialog (the name prompt, the Go to docker list) or a listbox anywhere on the page: shortcuts
 * wait for it. Overlays that are always mounted but hidden (a panel's hidden dialog) do not count.
 */
export const overlayOpen = (doc: Document = document): boolean =>
  [...doc.querySelectorAll(OVERLAY_SELECTOR)].some(isOpenOverlay);
