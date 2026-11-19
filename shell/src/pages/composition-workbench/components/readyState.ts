/**
 * The ready line's value (workbench "Ready line" rules, READY-LINE.md): what a panel or module with a main action
 * reports about whether that action can happen now. Each user writes ONE pure function returning this; the line
 * (`ReadyLine.tsx`) and the blocked action's tooltip read the same value.
 */
export type ReadyState = 'ready' | 'waiting' | 'no-target';

export interface ReadyValue {
  state: ReadyState;
  text: string;
}
