/**
 * "Go to docker": a list of the dockers by name, shown over the Stage (not a Mantine modal, so nothing fights over
 * focus when it closes: the caller moves focus to the chosen docker's active tab, or puts it back). Arrow Up and Down,
 * Home and End move between rows, Enter or a click picks, Escape closes and restores focus, Tab and a click outside
 * close without restoring. Each row shows its Alt+digit key.
 */
import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { DockerId } from '../../../lib/stage';
import { dockerCommandFor, keyLabel } from './keyMap';
import classes from './dock.module.css';

export interface GoToDockerProps {
  dockers: readonly { id: DockerId; name: string }[];
  selected: DockerId | undefined;
  onPick(id: DockerId): void;
  /** `restore`: Escape (give focus back to where it was); otherwise focus left the list. */
  onClose(restore: boolean): void;
}

export function GoToDocker({ dockers, selected, onPick, onClose }: GoToDockerProps) {
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const rows = [...(list.current?.querySelectorAll<HTMLElement>('button') ?? [])];
    (rows.find((r) => r.dataset.dockerId === selected) ?? rows[0])?.focus();
  }, [selected]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rows = [...(list.current?.querySelectorAll<HTMLElement>('button') ?? [])];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
    } else if (
      e.key === 'ArrowDown' ||
      e.key === 'ArrowUp' ||
      e.key === 'Home' ||
      e.key === 'End'
    ) {
      e.preventDefault();
      const to =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? rows.length - 1
            : (at + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows[to]?.focus();
    } else if (e.key === 'Tab') {
      onClose(false);
    }
  };

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="dialog"
      aria-label="Go to docker"
      className={classes.goTo}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          onClose(false);
        }
      }}
    >
      <p className={classes.goToTitle}>Go to docker</p>
      <ul ref={list} className={classes.goToList}>
        {dockers.map((d, i) => {
          const cmd = dockerCommandFor(i + 1);
          return (
            <li key={d.id}>
              <button
                type="button"
                className={classes.goToItem}
                data-docker-id={d.id}
                onClick={() => onPick(d.id)}
              >
                <span>{d.name}</span>
                {cmd && <span className={classes.goToKey}>{keyLabel(cmd)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
