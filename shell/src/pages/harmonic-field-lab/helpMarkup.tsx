/** Renders help markup (see `markup.ts`) as React nodes: no raw HTML, no dangerouslySetInnerHTML. */
import type { ReactNode } from 'react';
import { shortcutKey } from './audio/shortcuts';
import { parseMarkup, type Block } from './markup';
import classes from './components/lab.module.css';

export function renderMarkup(source: string): ReactNode[] {
  return parseMarkup(source).map((t, i) => {
    switch (t.type) {
      case 'bold':
        return <strong key={i}>{t.text}</strong>;
      case 'italic':
        return <em key={i}>{t.text}</em>;
      case 'key': {
        const k = shortcutKey(t.name);
        return k === undefined ? (
          `{key:${t.name}}`
        ) : (
          <kbd key={i} className={classes.helpKey}>
            {k}
          </kbd>
        );
      }
      default:
        return t.text;
    }
  });
}

/** One block: paragraph, `Example:` (label in italics) or `Keys:` (a row per key). Every block after the first has a blank line before it. */
export function BlockView({ block, first }: { block: Block; first?: boolean }) {
  const cls = first ? classes.helpBlock : `${classes.helpBlock} ${classes.helpGap}`;
  if (block.kind === 'keys') {
    return (
      <div className={cls}>
        Keys:
        <div className={classes.helpKeys}>
          {block.rows.map((r) => (
            <div key={r.key} className={classes.helpKeyRow}>
              <span className={classes.helpKeyName}>{renderMarkup(r.key)}</span>
              <span>{renderMarkup(r.does)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className={cls}>
      {block.kind === 'example' && <em>Example: </em>}
      {renderMarkup(block.text)}
    </div>
  );
}

/** Blocks in the order given (the glossary). */
export function Blocks({ blocks }: { blocks: readonly Block[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} first={i === 0} />
      ))}
    </>
  );
}
