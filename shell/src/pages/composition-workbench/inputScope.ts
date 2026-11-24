/**
 * The input scope of the workbench (design one-stage 7.2): one window-level pointer tracker and the
 * "is the pointer or the focus in an editing panel" test, shared by the data-block editor session, the
 * chord session and the roll. It was inside `NotesEditor` until M4b.
 *
 * Scope attributes: `data-note-editor-scope` (the data-block editor panel, the actions panel, the picker
 * host) and `data-chord-scope` (the chord picker frame and any non-Notes host that wants the keyboard
 * workflow). The helper treats the two as one scope.
 */
export const NOTE_EDITOR_SCOPE = '[data-note-editor-scope]';
// Not chordSession.ts's own CHORD_SCOPE (its picker frame plus this attribute): only the attribute.
export const CHORD_SCOPE_ATTR_SELECTOR = '[data-chord-scope]';
export const INPUT_SCOPE_SELECTOR = `${NOTE_EDITOR_SCOPE}, ${CHORD_SCOPE_ATTR_SELECTOR}`;

/**
 * Whether a key event's target is in the input scope: inside a scope element, or (with `orBody`)
 * nowhere in particular (the page body or the window).
 */
export function inInputScope(target: EventTarget | null, orBody = false): boolean {
  if (!(target instanceof Element)) {
    return orBody;
  }
  return (
    !!target.closest(INPUT_SCOPE_SELECTOR) ||
    (orBody && (target === document.body || target === document.documentElement))
  );
}

/** Whether a key event's target is a text field (a key typed there is never an editing key). */
export function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return (
    !!element &&
    (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName))
  );
}

/**
 * The tracker. `pointerHeld` is whether a pointer button is down anywhere: any drag or lane gesture
 * is one, and the arrow keys must not edit under it (window listeners, so a release outside the roll
 * still counts). `pointerInside` is whether the pointer is over any scope element; it resets on window
 * blur and when the pointer leaves the document.
 */
export class InputScope {
  private held = false;
  private inside = false;

  get pointerHeld(): boolean {
    return this.held;
  }

  get pointerInside(): boolean {
    return this.inside;
  }

  private readonly down = () => {
    this.held = true;
  };
  private readonly up = () => {
    this.held = false;
  };
  private readonly move = (event: PointerEvent) => {
    // A button that is no longer down (its release was lost, such as to a context menu) ends it too.
    if (event.buttons === 0 && this.held) {
      this.held = false;
    }
  };
  private readonly over = (event: PointerEvent) => this.track(event.target);
  private readonly out = (event: PointerEvent) => {
    if (event.relatedTarget === null) {
      this.inside = false;
    }
  };
  private readonly blur = () => {
    this.held = false;
    this.inside = false;
  };

  private track(target: EventTarget | null) {
    this.inside = target instanceof Element && target.closest(INPUT_SCOPE_SELECTOR) !== null;
  }

  /** Installs the window listeners; returns the removal. */
  install(): () => void {
    window.addEventListener('pointerdown', this.down, true);
    window.addEventListener('pointerup', this.up, true);
    window.addEventListener('pointercancel', this.up, true);
    window.addEventListener('pointermove', this.move, true);
    window.addEventListener('pointerover', this.over, true);
    window.addEventListener('pointerout', this.out, true);
    window.addEventListener('lostpointercapture', this.up, true);
    window.addEventListener('blur', this.blur);
    return () => {
      window.removeEventListener('pointerdown', this.down, true);
      window.removeEventListener('pointerup', this.up, true);
      window.removeEventListener('pointercancel', this.up, true);
      window.removeEventListener('pointermove', this.move, true);
      window.removeEventListener('pointerover', this.over, true);
      window.removeEventListener('pointerout', this.out, true);
      window.removeEventListener('lostpointercapture', this.up, true);
      window.removeEventListener('blur', this.blur);
      this.held = false;
      this.inside = false;
    };
  }
}
