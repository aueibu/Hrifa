import { describe, expect, it } from 'vitest';
import { PRESETS } from '../../../lib/harmonic-field';
import { BUILTIN_SUBFOLDERS, builtinFolders } from './builtinFolders';

describe('built-in folder table', () => {
  const listed = Object.entries(BUILTIN_SUBFOLDERS).flatMap(([group, subs]) =>
    Object.entries(subs).flatMap(([sub, names]) => names.map((name) => ({ group, sub, name })))
  );

  it('lists only real presets, each once, under their own group', () => {
    const byName = new Map(PRESETS.map((p) => [p.name, p]));
    const seen = new Set<string>();
    for (const e of listed) {
      expect(byName.has(e.name), `unknown preset ${e.name}`).toBe(true);
      expect(byName.get(e.name)!.group, e.name).toBe(e.group);
      expect(seen.has(e.name), `${e.name} listed twice`).toBe(false);
      seen.add(e.name);
    }
  });

  it('files every preset exactly once: in a subfolder of its group, or loose at the top of the group', () => {
    expect(PRESETS).toHaveLength(53);
    for (const p of PRESETS) {
      const folders = builtinFolders(p.name);
      expect(folders[0], p.name).toBe(p.group);
      expect(folders.length === 1 || folders.length === 2, p.name).toBe(true);
      const hits = listed.filter((e) => e.name === p.name);
      expect(hits.length, p.name).toBe(folders.length === 2 ? 1 : 0);
    }
  });

  it('has no subfolder with a single preset or an empty one', () => {
    for (const e of Object.values(BUILTIN_SUBFOLDERS).flatMap((s) => Object.values(s))) {
      expect(e.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('an unknown name has no folders', () => {
    expect(builtinFolders('No such preset')).toEqual([]);
  });

  it('puts Carlos Alpha under Equal divisions > Non-octave', () => {
    expect(builtinFolders('Carlos Alpha (9 ED 3/2)')).toEqual(['Equal divisions', 'Non-octave']);
  });
});
