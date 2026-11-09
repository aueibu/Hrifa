/**
 * SoundFont (.sf2) files the user has opened this session. A file is parsed once and kept here; a "voice" is
 * one preset of one file, named by an instrument id of the form `sf2:<file>|<bank>:<program>` so a performance
 * plan can refer to it like any other instrument. Files are not persisted: the browser cannot reopen a file
 * on its own, so a voice from an earlier visit has to be chosen again after the file is reopened.
 */
import type { Preset, SoundFont2 } from 'soundfont2';
import type { InstrumentId } from './types';

export interface SoundfontPresetInfo {
  bank: number;
  program: number;
  name: string;
}

export interface SoundfontInfo {
  /** Stable key for the file within this session. */
  id: string;
  fileName: string;
  sizeBytes: number;
  /** Every preset in the file, ordered by bank then program. */
  presets: SoundfontPresetInfo[];
}

const files = new Map<string, { info: SoundfontInfo; sf2: SoundFont2 }>();

export const isSoundfontVoice = (id: string): id is InstrumentId => id.startsWith('sf2:');

export const soundfontVoiceId = (fileId: string, bank: number, program: number): InstrumentId =>
  `sf2:${encodeURIComponent(fileId)}|${bank}:${program}`;

export function parseSoundfontVoice(
  id: string
): { fileId: string; bank: number; program: number } | null {
  const match = /^sf2:([^|]+)\|(\d+):(\d+)$/.exec(id);
  return match
    ? { fileId: decodeURIComponent(match[1]), bank: Number(match[2]), program: Number(match[3]) }
    : null;
}

/** Open and parse a .sf2 file. Large files take a few seconds and hold their samples in memory. */
export async function loadSoundfontFile(file: File): Promise<SoundfontInfo> {
  const { SoundFont2 } = await import('soundfont2');
  const data = new Uint8Array(await file.arrayBuffer());
  const sf2 = new SoundFont2(data);
  const info: SoundfontInfo = {
    id: `${file.name}#${file.size}`,
    fileName: file.name,
    sizeBytes: file.size,
    presets: sf2.presets
      .map((p) => ({ bank: p.header.bank, program: p.header.preset, name: p.header.name }))
      .sort((a, b) => a.bank - b.bank || a.program - b.program),
  };
  files.set(info.id, { info, sf2 });
  return info;
}

export const loadedSoundfont = (fileId: string): SoundfontInfo | undefined =>
  files.get(fileId)?.info;

/** The preset a voice id names, if its file is open. */
export function soundfontPreset(id: string): Preset | undefined {
  const voice = parseSoundfontVoice(id);
  const file = voice ? files.get(voice.fileId) : undefined;
  return file?.sf2.presets.find(
    (p) => p.header.bank === voice?.bank && p.header.preset === voice?.program
  );
}

/** Forget a file and free its samples. */
export function unloadSoundfont(fileId: string) {
  files.delete(fileId);
}
