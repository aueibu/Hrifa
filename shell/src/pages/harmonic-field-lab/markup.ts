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
