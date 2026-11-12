/** Scala (.scl) reading and writing. Pure. */
import { fmtRatio } from './intervals';
import type { Note } from './types';

export interface SclFile {
  desc: string;
  pitches: string[];
}

/** Read a .scl text: description line, count line, then up to `count` pitch tokens (comment lines start with "!"). */
export function parseScl(text: string): SclFile {
  const lines = text.split(/\r?\n/).filter((l) => !l.trim().startsWith('!'));
  const desc = (lines.shift() || '').trim();
  const count = parseInt(lines.shift() as string, 10);
  const pitches: string[] = [];
  for (const l of lines) {
    const t = l.trim().split(/\s+/)[0];
    if (t) {
      pitches.push(t);
    }
    if (pitches.length >= count) {
      break;
    }
  }
  return { desc, pitches };
}

/** Scala export of a subset (`rel` = rotateSubset result): ratios when rational, cents with 6 decimals otherwise. */
export function toScl(rel: Note[], rep: Note, name: string): string {
  const lines = [`! ${name}.scl`, `Harmonic Field Lab subset: ${name}`, ` ${rel.length}`, '!'];
  rel.slice(1).forEach((n) => lines.push(` ${n.m ? fmtRatio(n) : n.c.toFixed(6)}`));
  lines.push(` ${rep.m ? fmtRatio(rep) : rep.c.toFixed(6)}`);
  return `${lines.join('\n')}\n`;
}
