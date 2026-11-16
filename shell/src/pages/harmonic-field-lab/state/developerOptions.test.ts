import { describe, expect, it } from 'vitest';
import { parseDeveloperOptions } from './developerOptions';

describe('tile developer options defaults', () => {
  it('absent or damaged stored values read as Tinted with the outline on', () => {
    for (const raw of [null, '', '{', '[]', '{"tileOutline":"yes"}', '{"tileLook":"x"}']) {
      const o = parseDeveloperOptions(raw);
      expect(o.tileOutline, String(raw)).toBe(true);
      expect(o.tileLook, String(raw)).toBe('tinted');
    }
  });

  it('an explicit stored false stays false, an explicit true stays true', () => {
    expect(parseDeveloperOptions('{"tileOutline":false}').tileOutline).toBe(false);
    expect(parseDeveloperOptions('{"tileOutline":true}').tileOutline).toBe(true);
  });

  it('the three looks are kept, and the old stored names map: jewel to tinted, bright to solid', () => {
    for (const look of ['tinted', 'outlined', 'solid']) {
      expect(parseDeveloperOptions(`{"tileLook":"${look}"}`).tileLook).toBe(look);
    }
    expect(parseDeveloperOptions('{"tileLook":"jewel"}').tileLook).toBe('tinted');
    expect(parseDeveloperOptions('{"tileLook":"bright"}').tileLook).toBe('solid');
  });
});
