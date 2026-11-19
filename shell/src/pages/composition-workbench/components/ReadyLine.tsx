import { useEffect, useState } from 'react';
import { VisuallyHidden } from '@mantine/core';
import type { ReadyValue } from './readyState';
import classes from './ReadyLine.module.css';

/** Waiting: a clock (fixable here, by giving the panel what it waits for). Inline SVG: no icon package is a dependency. */
function WaitingIcon() {
  return (
    <svg className={classes.icon} viewBox="0 0 16 16" aria-hidden="true" data-ready-icon="waiting">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** No target: a circle with a bar (go somewhere else first). */
function NoTargetIcon() {
  return (
    <svg
      className={classes.icon}
      viewBox="0 0 16 16"
      aria-hidden="true"
      data-ready-icon="no-target"
    >
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.8 12.2 12.2 3.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** "Insert: one chord ..." -> the part up to the first colon is the mode or action name, shown bold. */
function splitLead(text: string): { lead: string; rest: string } | null {
  const at = text.indexOf(':');
  return at > 0 ? { lead: text.slice(0, at + 1), rest: text.slice(at + 1) } : null;
}

/**
 * The ready line (workbench "Ready line" rules): one fixed-height line directly under a panel's header that reports
 * whether the panel's main action can happen now and what it will do. Ready is plain text; Waiting and No target are
 * muted with their own icon (so the state is never color alone). A long text is cut with an ellipsis and the full text
 * is its tooltip. A visually hidden polite live region speaks the text only when the STATE changes, never on a count
 * change inside one state. It reports and never acts.
 */
export function ReadyLine({ value }: { value: ReadyValue }) {
  const { state, text } = value;
  // What assistive technology is told: the text at the last state change (a count change inside a state is silent).
  const [spoken, setSpoken] = useState(text);
  useEffect(() => {
    setSpoken(text);
    // Only a change of state speaks; the text read is the one current at that moment.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const parts = splitLead(text);
  return (
    <div className={classes.line} data-ready-line="" data-state={state} title={text}>
      {state === 'waiting' && <WaitingIcon />}
      {state === 'no-target' && <NoTargetIcon />}
      <span className={classes.text}>
        {parts ? (
          <>
            <b>{parts.lead}</b>
            {parts.rest}
          </>
        ) : (
          text
        )}
      </span>
      <VisuallyHidden role="status" aria-live="polite" data-ready-live="">
        {spoken}
      </VisuallyHidden>
    </div>
  );
}
