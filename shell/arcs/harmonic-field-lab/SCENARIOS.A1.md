# A1 scenarios: reverb (with your own impulse) and the sound's partials linked to Roughness

CONFIRMED by the human 2026-11-17 (D1: the partials link defaults to on; D2: the custom impulse is kept across reloads; D3: the limits as proposed). Nothing is built yet. Sound is judged by ear, so this is a thin slice: build, the human listens, then tune (preset sizes, mix defaults, limits).

## What exists today
`audio/engine.ts`: each note is one oscillator through a gain into a master volume and a gentle limiter. The `harmonic` sound is one wave of 7 partials, each 0.88 times the one below (the Sethares default); `sine` has none. `ui.wave` picks Sine | Harmonic, `ui.volume` the level. The Roughness scorer already has Partials and Rolloff settings (`scorerOpts.harmonics`, `rolloff`, default 7 and 0.88) that the sound ignores.

## Proposed design
1. **Reverb** (one shared convolution reverb for all notes): presets Dry, Room, Hall and Custom, plus a Mix slider (0 to 1). The built-in presets are impulses generated from decaying noise (Room about 0.9 s, Hall about 2.8 s). Default: Dry, mix 0: the sound is exactly as today.
2. **Your own impulse (Custom):** a Load impulse button takes an audio file (WAV, AIFF, MP3 or OGG, mono or stereo, at most 12 s and 8 MB), decodes it with the browser, normalizes it and uses it for the reverb. The file's name and length show next to the preset. It is kept in the browser's own storage (IndexedDB, not localStorage, which is too small), so it is still there after a reload. Remove custom impulse deletes it and goes back to Hall.
3. **Partials link (Developer tools toggle, default on):** the harmonic sound uses the Roughness Partials and Rolloff settings (so what you hear is what the Roughness numbers assume). Notes already sounding keep the wave they started with. Off: the sound stays at 7 and 0.88.
4. **Where:** an Audio popover beside the volume control with Sound (Sine | Harmonic), Reverb (preset, mix, Load impulse) and Volume; the partials link toggle is in Developer tools. Settings are additive fields in `settings.v1` (`ui.reverb`, preset and mix) and the Developer options store; the custom impulse is in IndexedDB.

## Scenarios

| # | Setup | Action | Expected |
| --- | --- | --- | --- |
| 1 | A fresh browser | Play a note | Exactly today's sound (reverb Dry, mix 0: the wet path is silent). |
| 2 | Reverb Room | Hold a note, release | A short tail (about 0.9 s). Mix 0 again: dry. |
| 3 | Reverb Hall, mix 1 | Hold a chord, release | A long tail (about 2.8 s), only the wet sound. |
| 4 | A tail is ringing | Press the panic Stop | The notes fade within 0.1 s and the tail is cut within about 0.15 s. |
| 5 | Load impulse, pick a 2.4 s WAV | | The preset shows `Custom: <name> (2.4 s)`; the reverb uses it; mix works as usual. A stereo file keeps its two channels; a mono one is used on both. |
| 6 | Load impulse, pick a 20 s file, or a 12 MB file, or a text file | | Refused with a one-line reason (`Longer than 12 s`, `Larger than 8 MB`, `Not an audio file`); the previous reverb stays. |
| 7 | A custom impulse is loaded | Reload the page | Still Custom with the same file and mix (stored); the first note after the reload uses it. |
| 8 | Custom is loaded | Remove custom impulse | It is deleted and the preset becomes Hall. |
| 9 | The stored impulse cannot be read (storage cleared) | Reload | The preset falls back to Hall with a one-line note. |
| 10 | Roughness Partials 3, Rolloff 0.88, link on, Harmonic sound | Play a note | Its wave has 3 partials with amplitudes 1, 0.88, 0.7744 (no partial above the third). |
| 11 | Same | Change Roughness Partials to 12 | The next note has 12 partials (amplitudes 0.88^(k-1)); a note still held keeps its 3. |
| 12 | Link off | Change Roughness Partials | The sound stays at 7 partials and 0.88. |
| 13 | Sine sound | Change Partials | No change (sine has no partials). |
| 14 | Reload | | Preset, mix, the link toggle and the sound choice are kept. |
| 15 | Browser without Web Audio | Open the Audio popover | The controls are disabled with the existing message; nothing throws. |

## Decisions for the human (recommendation first)
- **D1 Link default.** Recommended: on, because matching what you hear to the Roughness numbers is the point. Alternative: off (the sound never changes unless you turn the link on).
- **D2 Custom impulse kept across reloads.** Recommended: yes, in IndexedDB (up to 8 MB). Alternative: only for the session (you pick the file again each visit).
- **D3 Limits.** Recommended: 12 s and 8 MB for an impulse; the audio partials between 1 and 16 and the rolloff between 0.5 and 1 (the Roughness inputs may allow more; the sound clamps).

## Not in A1
A per-note or per-key reverb send, pre-delay and damping controls, impulse trimming, other effects (delay, chorus), exporting audio.
