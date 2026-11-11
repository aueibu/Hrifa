import {
  UNITY_GAIN,
  volumeDbLabel,
  volumeDbToPercent,
  volumePercentLabel,
  volumePercentToDb,
  volumePercentToGain,
} from './audio';

describe('decibel fader', () => {
  it('round-trips 0.1 dB positions through the stored percent', () => {
    [-59.9, -30, -10, -0.1, 0].forEach((db) => {
      expect(volumePercentToDb(volumeDbToPercent(db))).toBe(db);
    });
    expect(volumeDbToPercent(0)).toBe(100);
    expect(volumeDbToPercent(-60)).toBe(0);
    expect(volumePercentToDb(0)).toBe(-60);
    expect(volumeDbLabel(-10)).toBe('-10.0 dB');
    expect(volumeDbLabel(-60)).toBe('−∞ dB');
  });
});

describe('shared module volume', () => {
  it('maps the fader from silence to unity with a logarithmic dB readout', () => {
    expect(volumePercentToGain(0)).toBe(0);
    expect(volumePercentToGain(25)).toBe(0.25);
    expect(volumePercentToGain(100)).toBe(1);
    expect(volumePercentToGain(100)).toBe(UNITY_GAIN);
    expect(volumePercentLabel(0)).toBe('−∞ dB');
    expect(volumePercentLabel(25)).toBe('-12.0 dB');
    expect(volumePercentLabel(100)).toBe('0.0 dB');
  });
});
