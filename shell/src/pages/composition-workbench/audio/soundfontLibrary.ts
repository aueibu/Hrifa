/**
 * SoundFont files (.sf2, .sf3, .dls) the user has opened this session. A file is parsed once and kept here; a
 * "voice" is one preset of one file, named by an instrument id of the form
 * `sf2:<file>|<bank msb>:<bank lsb>:<program>` so a performance plan can refer to it like any other instrument
 * (a drum kit uses bank 128). The sound is produced by SpessaSynth, a full SoundFont synthesizer, in
 * soundfontSynth.ts. Files are not persisted here: the browser cannot reopen a file on its own, so a voice from
 * an earlier visit has to be chosen again after the file is reopened (see soundfontStore.ts).
 */
import type { BasicSoundBank } from 'spessasynth_core';
import type { InstrumentId } from './types';

export interface SoundfontPresetInfo {
  /** Bank select MSB; 128 for a drum kit. */
  bank: number;
  bankLSB: number;
  program: number;
  isDrum: boolean;
  name: string;
}

export interface SoundfontInfo {
  /** Stable key for the file within this session. */
  id: string;
  fileName: string;
  sizeBytes: number;
  /** Every preset in the file: melodic presets by bank then program, then drum kits. */
  presets: SoundfontPresetInfo[];
}

/** The patch a voice selects, in the terms the synthesizer uses. */
export interface SoundfontPatch {
  bankMSB: number;
  bankLSB: number;
  program: number;
  isDrum: boolean;
}

const DRUM_BANK = 128;

const banks = new Map<string, { info: SoundfontInfo; bank: BasicSoundBank }>();

export const isSoundfontVoice = (id: string): id is InstrumentId => id.startsWith('sf2:');

export const soundfontVoiceId = (fileId: string, preset: SoundfontPresetInfo): InstrumentId =>
  `sf2:${encodeURIComponent(fileId)}|${preset.bank}:${preset.bankLSB}:${preset.program}`;

export function parseSoundfontVoice(
  id: string
): { fileId: string; bank: number; bankLSB: number; program: number } | null {
  const match = /^sf2:([^|]+)\|(\d+):(\d+):(\d+)$/.exec(id);
  return match
    ? {
        fileId: decodeURIComponent(match[1]),
        bank: Number(match[2]),
        bankLSB: Number(match[3]),
        program: Number(match[4]),
      }
    : null;
}

/** The same file keeps the same id across visits, so a remembered voice id still finds its preset. */
export const soundfontFileId = (fileName: string, sizeBytes: number) => `${fileName}#${sizeBytes}`;

/** Parse a sound bank file's bytes. Parsing is quick: sample data is only decoded when a note needs it. */
export async function loadSoundfontData(
  fileName: string,
  data: Uint8Array
): Promise<SoundfontInfo> {
  const { SoundBankLoader } = await import('spessasynth_core');
  const buffer = (
    data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
      ? data.buffer
      : data.slice().buffer
  ) as ArrayBuffer;
  const bank = SoundBankLoader.fromArrayBuffer(buffer);
  const info: SoundfontInfo = {
    id: soundfontFileId(fileName, data.byteLength),
    fileName,
    sizeBytes: data.byteLength,
    presets: bank.presets
      .map((p) => ({
        bank: p.isDrum ? DRUM_BANK : p.bankMSB,
        bankLSB: p.bankLSB,
        program: p.program,
        isDrum: p.isDrum,
        name: p.name,
      }))
      .sort(
        (a, b) =>
          Number(a.isDrum) - Number(b.isDrum) ||
          a.bank - b.bank ||
          a.bankLSB - b.bankLSB ||
          a.program - b.program
      ),
  };
  banks.set(info.id, { info, bank });
  return info;
}

/** Open and parse a sound bank file the user picked. */
export async function loadSoundfontFile(file: File): Promise<SoundfontInfo> {
  return loadSoundfontData(file.name, new Uint8Array(await file.arrayBuffer()));
}

export const loadedSoundfont = (fileId: string): SoundfontInfo | undefined =>
  banks.get(fileId)?.info;

/** The parsed bank and patch a voice id names, if its file is open and holds that preset. */
export function soundfontVoice(
  id: string
): { fileId: string; bank: BasicSoundBank; patch: SoundfontPatch; name: string } | undefined {
  const voice = parseSoundfontVoice(id);
  const file = voice ? banks.get(voice.fileId) : undefined;
  if (!voice || !file) {
    return undefined;
  }
  const isDrum = voice.bank === DRUM_BANK;
  const preset = file.info.presets.find(
    (p) =>
      p.isDrum === isDrum &&
      p.bank === voice.bank &&
      p.bankLSB === voice.bankLSB &&
      p.program === voice.program
  );
  return preset
    ? {
        fileId: voice.fileId,
        bank: file.bank,
        name: preset.name,
        patch: {
          bankMSB: isDrum ? 0 : voice.bank,
          bankLSB: voice.bankLSB,
          program: voice.program,
          isDrum,
        },
      }
    : undefined;
}

/** Whether the file for a voice id is open and holds its preset. */
export const hasSoundfontVoice = (id: string) => soundfontVoice(id) !== undefined;

/** Forget a file and free its samples. */
export function unloadSoundfont(fileId: string) {
  banks.delete(fileId);
}
