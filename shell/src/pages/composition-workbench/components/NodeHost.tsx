import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Text } from '@mantine/core';
import type { PublishedCompositionOutput } from '../compositionRouting';
import { InfoTooltip } from './hoverInfo';
import { NodeOutput } from './NodeShell';
import { SendToDeskButton } from './SendToDeskButton';
import classes from './ModuleHost.module.css';

/**
 * Where a node's setup controls (sources, grid, preview, outputs) are shown: the inspector's
 * Node part. Nodes keep all their state in their own hooks, so the setup controls are portaled
 * into this element rather than lifted out of the node.
 */
export const NodeInspectorSlotContext = createContext<HTMLElement | null>(null);

/** True only for the node open in the detail panel; hidden nodes show nothing in the inspector. */
export const NodeActiveContext = createContext(false);

/**
 * Setup controls for the active node. They render in the inspector when it is open; when the
 * inspector is hidden they fall back to where this element is placed in the node, so a setup
 * control is never unreachable.
 */
export function NodeInspectorContent({ children }: { children: ReactNode }) {
  const slot = useContext(NodeInspectorSlotContext);
  const active = useContext(NodeActiveContext);
  if (!active) {
    return null;
  }
  return slot ? createPortal(children, slot) : <div className={classes.inline}>{children}</div>;
}

/** The Outputs section: one stacked summary per published output. Renders nothing when empty. */
export function NodeOutputsSection({
  instanceLabel,
  outputs,
}: {
  instanceLabel: string;
  outputs: PublishedCompositionOutput[];
}) {
  if (outputs.length === 0) {
    return null;
  }
  return (
    <InspectorSection label="Outputs">
      {outputs.map((output) => (
        <NodeOutput
          key={output.ref.port}
          name={output.label.replace(`${instanceLabel} · `, '')}
          packet={output.packet}
          stacked
        >
          <SendToDeskButton output={output} />
        </NodeOutput>
      ))}
    </InspectorSection>
  );
}

/**
 * A label whose explanation lives in a hover tooltip instead of a line of help text under the
 * control: the label gets a dotted underline to show there is more. Use it for a control's label
 * (Mantine inputs take a node) or a section title, so the panel stays short.
 */
export function HelpTip({ help, children }: { help: ReactNode; children: ReactNode }) {
  return (
    <InfoTooltip help={help} className={classes.helpTip}>
      {children}
    </InfoTooltip>
  );
}

/** A labelled group of setup controls, in the inspector or inline. */
export function InspectorSection({
  label,
  help,
  children,
}: {
  label: string;
  /** Shown on hover over the title. */
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={classes.section}>
      <Text className={classes.label} size="xs" fw={700} tt="uppercase">
        {help ? <HelpTip help={help}>{label}</HelpTip> : label}
      </Text>
      <div className={classes.content}>{children}</div>
    </section>
  );
}

export interface NodeNotice {
  tone: 'error' | 'warning' | 'info';
  text: string;
}

/**
 * Errors, warnings and other messages a node wants to show, in small type at the top of its
 * controls panel, so they appear without pushing the visualization around. Renders nothing when
 * there are none.
 */
export function NodeNotices({ items }: { items: NodeNotice[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className={classes.notices} role="status">
      {items.map((item, index) => (
        <p key={index} className={classes.notice} data-tone={item.tone}>
          {item.text}
        </p>
      ))}
    </div>
  );
}
