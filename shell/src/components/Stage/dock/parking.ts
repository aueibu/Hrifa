/**
 * Panel hosts and parking for the dock Stage (DOM helpers, no React).
 *
 * Every panel is rendered ONCE (a portal) into a stable host element. The host is physically moved into whichever
 * container should hold it: its docker's body (the active tab visible, the other tabs parked IN PLACE in the same grid
 * cell), a docker's park box (collapsed or narrow-hidden dockers, laid out at the last measured size), or a panel park
 * box (a `keepMounted` panel that is in no docker). A parked host is never `display: none` and never detached: it gets
 * `opacity: 0`, `pointer-events: none`, `visibility: hidden` AND `inert` (visibility alone is not enough: a canvas's
 * own elements may set `visibility: visible`, which wins over a hidden parent).
 *
 * A re-parent loses DOM scroll, so the host's scroll offset is recorded as it scrolls and written back after a move.
 */

const scrollMemo = new WeakMap<HTMLElement, { top: number; left: number }>();

/** A new host element for panel `id`; it records its own scroll position. */
export function createHost(id: string, className: string): HTMLDivElement {
  const host = document.createElement('div');
  host.className = className;
  host.dataset.panelHost = id;
  host.addEventListener('scroll', () => {
    if (host.isConnected) {
      scrollMemo.set(host, { top: host.scrollTop, left: host.scrollLeft });
    }
  });
  return host;
}

/**
 * Move `host` into `container` unless it is already there; keeps focus inside the host and restores its scroll.
 * Returns true when it moved.
 */
export function adopt(container: HTMLElement, host: HTMLElement): boolean {
  if (host.parentElement === container) {
    return false;
  }
  const saved = scrollMemo.get(host);
  const top = saved?.top ?? host.scrollTop;
  const left = saved?.left ?? host.scrollLeft;
  const active = document.activeElement;
  const had = active instanceof HTMLElement && host.contains(active) ? active : null;
  container.appendChild(host);
  if (top > 0) {
    host.scrollTop = top;
  }
  if (left > 0) {
    host.scrollLeft = left;
  }
  if (top > 0 || left > 0) {
    scrollMemo.set(host, { top, left });
  }
  if (had?.isConnected && document.activeElement !== had) {
    had.focus({ preventScroll: true });
  }
  return true;
}

/**
 * Move `host` into `holding` (the park layer) while its container is being removed, keeping its scroll offset for the
 * `adopt` that follows in the same commit. Never leaves the host detached.
 */
export function hold(holding: HTMLElement, host: HTMLElement): void {
  scrollMemo.set(host, { top: host.scrollTop, left: host.scrollLeft });
  setParked(host, true);
  holding.appendChild(host);
}

/** Make a host invisible, unclickable and inert (parked), or visible again. */
export function setParked(host: HTMLElement, parked: boolean): void {
  if (parked) {
    host.style.opacity = '0';
    host.style.pointerEvents = 'none';
    host.style.visibility = 'hidden';
    host.setAttribute('inert', '');
    host.dataset.parked = 'true';
  } else {
    host.style.removeProperty('opacity');
    host.style.removeProperty('pointer-events');
    host.style.removeProperty('visibility');
    host.removeAttribute('inert');
    delete host.dataset.parked;
  }
}
