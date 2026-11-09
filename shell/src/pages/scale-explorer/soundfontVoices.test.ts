import { describe, expect, it } from 'vitest';
import {
  parseSoundfontVoice,
  soundfontFileId,
  soundfontVoiceId,
} from '../composition-workbench/audio/soundfontLibrary';
import { canRememberFiles } from '../composition-workbench/audio/soundfontStore';
import { isVoice } from './playback';
import { defaultSettings, sanitizeSettings } from './settings';

const preset = (bank: number, bankLSB: number, program: number) => ({
  bank,
  bankLSB,
  program,
  isDrum: false,
  name: 'Test',
});

describe('SoundFont voice ids', () => {
  it('round-trips file names with spaces, bars, hashes and non-ASCII characters', () => {
    const names = [
      'Timbres Of Heaven GM_GS_XG_SFX V 3.4 Final.sf2',
      'a|b#c.sf2',
      'Ünïcode — fönt.sf2',
    ];
    names.forEach((name) => {
      const fileId = soundfontFileId(name, 395_000_000);
      const id = soundfontVoiceId(fileId, preset(8, 3, 24));
      expect(parseSoundfontVoice(id)).toEqual({ fileId, bank: 8, bankLSB: 3, program: 24 });
    });
  });

  it('gives the same file the same id on every visit, so a remembered voice finds its preset again', () => {
    expect(soundfontFileId('x.sf2', 123)).toBe(soundfontFileId('x.sf2', 123));
    expect(soundfontFileId('x.sf2', 123)).not.toBe(soundfontFileId('x.sf2', 124));
  });

  it('rejects ids that are not a SoundFont voice', () => {
    expect(parseSoundfontVoice('gm.piano')).toBeNull();
    expect(parseSoundfontVoice('sf2:file')).toBeNull();
    expect(parseSoundfontVoice('sf2:file|a:b')).toBeNull();
    expect(parseSoundfontVoice('sf2:file|0:1')).toBeNull();
  });
});

describe('remembering a SoundFont between visits', () => {
  it('accepts a SoundFont voice as a saved sound but still rejects junk', () => {
    const id = soundfontVoiceId(soundfontFileId('Heaven.sf2', 1), preset(0, 0, 73));
    expect(isVoice(id)).toBe(true);
    expect(isVoice('sf2:no-bar')).toBe(false);
    expect(isVoice('preview.nope')).toBe(false);
    expect(isVoice(42)).toBe(false);
  });

  it('keeps a saved SoundFont voice in the settings and falls back for a bad one', () => {
    const id = soundfontVoiceId(soundfontFileId('Heaven.sf2', 1), preset(0, 0, 73));
    expect(sanitizeSettings({ voice: id }).voice).toBe(id);
    expect(sanitizeSettings({ voice: 'sf2:broken' }).voice).toBe(defaultSettings().voice);
  });

  it('reports that file handles are unavailable where the browser lacks the API', () => {
    expect(canRememberFiles()).toBe(false);
  });
});
