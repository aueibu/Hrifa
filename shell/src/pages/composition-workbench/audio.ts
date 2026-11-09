export const UNITY_GAIN = 1;

export function volumePercentToGain(percent: number) {
  return Math.max(0, Math.min(100, percent)) / 100;
}

/** Bottom of a decibel fader; at or below it the fader is silent (−∞ dB). */
export const FADER_FLOOR_DB = -60;

/** The stored percent as a fader position in dB, rounded to 0.1 dB (floor = silence). */
export function volumePercentToDb(percent: number) {
  const gain = volumePercentToGain(percent);
  if (gain === 0) {
    return FADER_FLOOR_DB;
  }
  return Math.max(FADER_FLOOR_DB, Math.round(200 * Math.log10(gain)) / 10);
}

/** A fader position in dB as the stored percent; the floor and below is silence. */
export function volumeDbToPercent(db: number) {
  return db <= FADER_FLOOR_DB ? 0 : Math.min(100, 100 * 10 ** (db / 20));
}

export function volumeDbLabel(db: number) {
  return db <= FADER_FLOOR_DB ? "−∞ dB" : `${db.toFixed(1)} dB`;
}

export function volumePercentLabel(percent: number) {
  const gain = volumePercentToGain(percent);
  return gain === 0 ? "−∞ dB" : `${(20 * Math.log10(gain)).toFixed(1)} dB`;
}
