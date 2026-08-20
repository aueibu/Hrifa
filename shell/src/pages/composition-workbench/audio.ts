export const UNITY_GAIN = 1;

export function volumePercentToGain(percent: number) {
  return Math.max(0, Math.min(100, percent)) / 100;
}

export function volumePercentLabel(percent: number) {
  const gain = volumePercentToGain(percent);
  return gain === 0 ? "−∞ dB" : `${(20 * Math.log10(gain)).toFixed(1)} dB`;
}
