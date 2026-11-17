import { describe, expect, it } from 'vitest';
import { deleteImpulse, loadImpulse, saveImpulse } from './impulseStorage';

// Node has no IndexedDB: this is exactly the "storage is unavailable" case (a private window, an old browser).
describe('impulse storage without IndexedDB', () => {
  it('has no stored impulse and says so without throwing', async () => {
    expect(typeof indexedDB).toBe('undefined');
    expect(await loadImpulse()).toBeNull();
  });

  it('save and delete report failure (false) instead of throwing', async () => {
    const imp = { name: 'a.wav', sampleRate: 48000, channels: [new Float32Array(10)] };
    expect(await saveImpulse(imp)).toBe(false);
    expect(await deleteImpulse()).toBe(false);
  });
});
