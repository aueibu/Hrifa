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

describe('cardNoteErrors developer option (H-24)', () => {
  it('is off by default, when absent, and when damaged; old data loads unchanged', () => {
    for (const raw of [null, '', '{', '[]', '{"tooltips":false}', '{"cardNoteErrors":"yes"}']) {
      expect(parseDeveloperOptions(raw).cardNoteErrors, String(raw)).toBe(false);
    }
    expect(parseDeveloperOptions('{"tooltips":false}').tooltips).toBe(false);
  });

  it('an explicit true stays on, an explicit false stays off', () => {
    expect(parseDeveloperOptions('{"cardNoteErrors":true}').cardNoteErrors).toBe(true);
    expect(parseDeveloperOptions('{"cardNoteErrors":false}').cardNoteErrors).toBe(false);
  });
});

describe('soundFollowsRoughness developer option (A1, H-31)', () => {
  it('is on by default, when absent, and when damaged; old data loads unchanged', () => {
    for (const raw of [
      null,
      '',
      '{',
      '[]',
      '{"tooltips":false}',
      '{"soundFollowsRoughness":"yes"}',
    ]) {
      expect(parseDeveloperOptions(raw).soundFollowsRoughness, String(raw)).toBe(true);
    }
    expect(parseDeveloperOptions('{"tooltips":false}').tooltips).toBe(false);
  });

  it('an explicit false stays off, an explicit true stays on', () => {
    expect(parseDeveloperOptions('{"soundFollowsRoughness":false}').soundFollowsRoughness).toBe(
      false
    );
    expect(parseDeveloperOptions('{"soundFollowsRoughness":true}').soundFollowsRoughness).toBe(
      true
    );
  });
});
