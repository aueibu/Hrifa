import { UNITY_GAIN, volumePercentLabel, volumePercentToGain } from "./audio";

describe("shared module volume", () => {
  it("maps the fader from silence to unity with a logarithmic dB readout", () => {
    expect(volumePercentToGain(0)).toBe(0);
    expect(volumePercentToGain(25)).toBe(0.25);
    expect(volumePercentToGain(100)).toBe(1);
    expect(volumePercentToGain(100)).toBe(UNITY_GAIN);
    expect(volumePercentLabel(0)).toBe("−∞ dB");
    expect(volumePercentLabel(25)).toBe("-12.0 dB");
    expect(volumePercentLabel(100)).toBe("0.0 dB");
  });
});
