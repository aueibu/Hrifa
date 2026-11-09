import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Text } from '@mantine/core';
import classes from './ModuleHost.module.css';

/**
 * Where a module's setup controls (sources, grid, preview, outputs) are shown: the inspector's
 * Module part. Modules keep all their state in their own hooks, so the setup controls are portaled
 * into this element rather than lifted out of the module.
 */
export const ModuleInspectorSlotContext = createContext<HTMLElement | null>(null);

/** True only for the module open in the detail panel; hidden modules show nothing in the inspector. */
export const ModuleActiveContext = createContext(false);

/**
 * Setup controls for the active module. They render in the inspector when it is open; when the
 * inspector is hidden they fall back to where this element is placed in the module, so a setup
 * control is never unreachable.
 */
export function ModuleInspectorContent({ children }: { children: ReactNode }) {
  const slot = useContext(ModuleInspectorSlotContext);
  const active = useContext(ModuleActiveContext);
  if (!active) {
    return null;
  }
  return slot ? createPortal(children, slot) : <div className={classes.inline}>{children}</div>;
}

/** A labelled group of setup controls, in the inspector or inline. */
export function InspectorSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={classes.section}>
      <Text className={classes.label} size="xs" fw={700} tt="uppercase">
        {label}
      </Text>
      <div className={classes.content}>{children}</div>
    </section>
  );
}
