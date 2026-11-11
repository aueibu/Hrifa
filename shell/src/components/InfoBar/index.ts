import { createContext, useContext } from 'react';

/**
 * True where an info bar is on screen to show hover text. Hover explanations then go to the bar
 * (through `data-info` attributes) and native `title` tooltips are left off, so one thing does not
 * explain itself twice. Without a bar (other pages, tests) `title` tooltips work as usual.
 */
export const InfoBarActiveContext = createContext(false);

/** Whether hover text goes to the info bar. */
export function useInfoBarActive() {
  return useContext(InfoBarActiveContext);
}
