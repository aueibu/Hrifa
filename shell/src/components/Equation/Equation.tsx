import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface EquationProps {
  /** Raw LaTeX source (no surrounding $ / \[ \] delimiters). */
  children: string;
  /** Block (own line, centered, display-style large operators) vs inline. */
  block?: boolean;
}

/**
 * Renders LaTeX via KaTeX. `renderToString` (not the `react-katex` wrapper
 * package) since KaTeX's own output is already static markup — one fewer
 * dependency for what's otherwise just `dangerouslySetInnerHTML`.
 * `throwOnError: false` so a typo in one equation renders KaTeX's own
 * inline error text instead of crashing the whole modal.
 */
export function Equation({ children, block = true }: EquationProps) {
  const html = useMemo(
    () =>
      katex.renderToString(children, {
        displayMode: block,
        throwOnError: false,
        output: 'html',
      }),
    [children, block]
  );
  // eslint-disable-next-line react/no-danger
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
