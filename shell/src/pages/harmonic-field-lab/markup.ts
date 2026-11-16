/**
 * The help-text markup, as data: `**bold**`, `*italic*` and `{key:name}` (a key label looked up in the shortcut table).
 * Anything else, including every `<`, stays plain text. `helpMarkup.tsx` turns tokens into React nodes.
 */
import { shortcutKey } from './audio/shortcuts';

/** One block of an entry's help or teaching. Text is markup. */
export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'example'; text: string }
  | { kind: 'keys'; rows: readonly { key: string; does: string }[] };

export type MarkupToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'key'; name: string };

const PATTERN = /\*\*([^*]+?)\*\*|\*([^*\s][^*]*?)\*|\{key:([A-Za-z0-9_]+)\}/g;

export function parseMarkup(source: string): MarkupToken[] {
  const out: MarkupToken[] = [];
  let last = 0;
  for (const m of source.matchAll(PATTERN)) {
    const at = m.index ?? 0;
    if (at > last) {
      out.push({ type: 'text', text: source.slice(last, at) });
    }
    if (m[1] !== undefined) {
      out.push({ type: 'bold', text: m[1] });
    } else if (m[2] !== undefined) {
      out.push({ type: 'italic', text: m[2] });
    } else {
      out.push({ type: 'key', name: m[3] });
    }
    last = at + m[0].length;
  }
  if (last < source.length) {
    out.push({ type: 'text', text: source.slice(last) });
  }
  return out;
}

/** The text without markup characters; a `{key:name}` becomes its key (or stays as written when unknown). */
export function plainText(source: string): string {
  return parseMarkup(source)
    .map((t) => {
      if (t.type === 'key') {
        return shortcutKey(t.name) ?? `{key:${t.name}}`;
      }
      return t.text;
    })
    .join('');
}

/** A line of running text is at most about this many characters before the next sentence starts on a new line (about 3 lines). */
export const LINE_GROUP_MAX = 140;

/**
 * Splits a paragraph at sentence ends into lines of whole sentences: a line is closed when the next sentence would push it past
 * `max` characters (a single long sentence stays whole). The caller renders a line break between lines, not a blank line.
 * A sentence ends at `.`, `!` or `?` followed by a space and a capital letter, a digit, a quote, a bracket or markup.
 */
export function sentenceLines(source: string, max = LINE_GROUP_MAX): string[] {
  const sentences = source.split(/(?<=[.!?])\s+(?=[A-Z0-9"“'({*{])/);
  const lines: string[] = [];
  for (const s of sentences) {
    const last = lines.length - 1;
    if (last >= 0 && plainText(lines[last]).length + 1 + plainText(s).length <= max) {
      lines[last] = `${lines[last]} ${s}`;
    } else {
      lines.push(s);
    }
  }
  return lines;
}

/**
 * An old-form entry's single string as blocks: everything before an `Example:` (or `Example in a 5-limit field:`) is a paragraph,
 * and each example runs to the next `Example` or the end of the text, as its own block (so it gets a blank line above it).
 */
export function legacyBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const re = /(?:^|\s)Example( [^:.]{1,40})?:\s+/g;
  let last = 0;
  let pending: string | null = null;
  const push = (end: number) => {
    const chunk = text.slice(last, end).trim();
    if (chunk) {
      blocks.push(
        pending === null ? { kind: 'p', text: chunk } : { kind: 'example', text: pending + chunk }
      );
    }
  };
  for (const m of text.matchAll(re)) {
    push(m.index ?? 0);
    pending = m[1] ? `${m[1].trim()}: ` : '';
    last = (m.index ?? 0) + m[0].length;
  }
  push(text.length);
  return blocks.length > 0 ? blocks : [{ kind: 'p', text }];
}

/**
 * Glues a number to its unit (`21.5 c`, `392.44 Hz`) with a no-break space so a line never ends on a lone "c" or "Hz".
 * Lists of values break only between whole values (`components/ValueList.tsx`); this covers units inside running text.
 */
export function glueUnits(text: string): string {
  return text.replace(/(\d) +(c|Hz)\b/g, '$1\u00a0$2');
}
