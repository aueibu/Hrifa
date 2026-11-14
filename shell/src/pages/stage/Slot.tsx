/**
 * One slot: a header strip (module title and tools) over a body. The body is measured with a ResizeObserver
 * (border-box, header excluded), published as `data-slot-size="<width>-<height>"`, and adopts the module's persistent
 * host element (the module itself is rendered once by the Stage through a portal into that host, so moving the slot
 * never unmounts it; ARCHITECTURE.md section 10).
 */
import { useLayoutEffect, useRef } from 'react';
import { ActionIcon, Menu } from '@mantine/core';
import { pxToRem, slotSizeAttr, type SlotSize } from '../../lib/stage';
import { CloseIcon, DownIcon, LeftIcon, RightIcon, StackIcon, UnstackIcon, UpIcon } from './icons';
import classes from './stage.module.css';

export interface SlotTools {
  canLeft: boolean;
  canRight: boolean;
  /** Reorder within a stack; both are false for a single slot. */
  canUp: boolean;
  canDown: boolean;
  stacked: boolean;
  stackTargets: { id: string; title: string; enabled: boolean }[];
  onLeft(): void;
  onRight(): void;
  onUp(): void;
  onDown(): void;
  onStack(targetId: string): void;
  onUnstack(): void;
  onClose(): void;
}

export interface SlotProps {
  id: string;
  title: string;
  /** The module's persistent host element. */
  host: HTMLElement;
  /** The measured size class (the module itself gets the nearest size it supports). */
  size: SlotSize;
  onMeasure(id: string, widthRem: number, heightRem: number): void;
  tools: SlotTools;
  showSize?: boolean;
}

/** Accessible names of the header tools (Stage.tsx refocuses a tool by name after it moved the slot). */
export const TOOL_LABEL = {
  left: (t: string) => `Move ${t} left`,
  right: (t: string) => `Move ${t} right`,
  up: (t: string) => `Move ${t} up in its stack`,
  down: (t: string) => `Move ${t} down in its stack`,
  stack: (t: string) => `Stack ${t} onto`,
  unstack: (t: string) => `Unstack ${t}`,
  close: (t: string) => `Close ${t}`,
};

/**
 * The element that had focus inside a module's host when its old slot let go of it. A slot that is replaced (a move)
 * cleans up before the new one adopts the host, and by then focus has fallen back to the body, so the old slot writes it
 * here and the new one reads it.
 */
const focusMemo = new WeakMap<HTMLElement, HTMLElement>();

/** Move `host` into `body`, then give focus back to what had it inside the host (a reparented node loses focus). */
function adopt(body: HTMLElement, host: HTMLElement) {
  if (host.parentElement === body) {
    return;
  }
  const active = document.activeElement;
  const had =
    focusMemo.get(host) ?? (active instanceof HTMLElement && host.contains(active) ? active : null);
  focusMemo.delete(host);
  body.appendChild(host);
  if (had?.isConnected && document.activeElement !== had) {
    had.focus({ preventScroll: true });
  }
}

export function Slot({ id, title, host, size, onMeasure, tools, showSize }: SlotProps) {
  const body = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = body.current;
    if (!el) {
      return undefined;
    }
    adopt(el, host);
    return () => {
      // the host may already have been adopted by a newer slot (a move): only remove it when it is still ours
      if (host.parentElement === el) {
        const active = document.activeElement;
        if (active instanceof HTMLElement && host.contains(active)) {
          focusMemo.set(host, active);
        }
        host.remove();
      }
    };
  }, [host]);

  useLayoutEffect(() => {
    const el = body.current;
    if (!el) {
      return undefined;
    }
    const read = () => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        return; // not laid out (hidden): keep the last size
      }
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      onMeasure(id, pxToRem(r.width, root), pxToRem(r.height, root));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [id, onMeasure]);

  const attr = slotSizeAttr(size);

  return (
    <section className={classes.slot} aria-label={title} data-slot-id={id} tabIndex={-1}>
      <header className={classes.strip}>
        <h2 className={classes.stripTitle}>{title}</h2>
        <div className={classes.stripTools}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={TOOL_LABEL.left(title)}
            disabled={!tools.canLeft}
            onClick={tools.onLeft}
          >
            <LeftIcon />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={TOOL_LABEL.right(title)}
            disabled={!tools.canRight}
            onClick={tools.onRight}
          >
            <RightIcon />
          </ActionIcon>
          {tools.stacked && (
            <>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={TOOL_LABEL.up(title)}
                disabled={!tools.canUp}
                onClick={tools.onUp}
              >
                <UpIcon />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={TOOL_LABEL.down(title)}
                disabled={!tools.canDown}
                onClick={tools.onDown}
              >
                <DownIcon />
              </ActionIcon>
            </>
          )}
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={TOOL_LABEL.stack(title)}
                disabled={tools.stackTargets.length === 0}
              >
                <StackIcon />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {tools.stackTargets.map((t) => (
                <Menu.Item key={t.id} disabled={!t.enabled} onClick={() => tools.onStack(t.id)}>
                  {`Stack onto ${t.title}`}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          {tools.stacked && (
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={TOOL_LABEL.unstack(title)}
              onClick={tools.onUnstack}
            >
              <UnstackIcon />
            </ActionIcon>
          )}
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={TOOL_LABEL.close(title)}
            onClick={tools.onClose}
          >
            <CloseIcon />
          </ActionIcon>
        </div>
      </header>
      <div ref={body} className={classes.slotBody} data-slot-size={attr} />
      {showSize && (
        <span className={classes.sizeBadge} aria-hidden="true">
          {attr}
        </span>
      )}
    </section>
  );
}
