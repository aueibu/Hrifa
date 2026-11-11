# Swirling Mists module: spec (draft)

Status: v1 built (see ARCHITECTURE.md, "Swirling Mists"). Source: the retired WPF lens (`SwirlingMists-source.zip`), read in full.
v1 differences from this draft: the open check on group items resolved in favor of `list | integer` with group
items (the pitch route and Arithmetic both read `number | number[]`); the plot has no playhead yet; default
settings use the Ripple preset because Soft Drift looks flat in 16 steps.

## What the old code actually computes

Per stratum `i`, the value is `baseline + clamp(table_i[(x + phase0 + speed·t) mod L])`.

`x` and `t` are the **same axis**. Both add to one phase; they differ only in rate: `x` moves every
stratum 1 cell per unit, `t` moves stratum `i` by `speed_i` cells per unit. The field is a set of
traveling waves, and the lens exposed one wave position as two coordinates, two cursors and two
extraction windows. That is why it was confusing. With all speeds equal to 1 they are interchangeable.

Other facts the handoff did not cover:

- There is no amplitude parameter. A sine is always ±1, and `clamp` is the only way to shrink it
  (it clips, so it flattens peaks instead of scaling).
- A random-walk table has `L` cells, so changing the loop length produces a different walk, not a
  stretched one. The walk is not seamless: cell `L-1` jumps back to cell 0. Smoothing does not wrap.
- A custom table is resampled with `i/(L-1)`, so its endpoints are both included; loops stretch slightly.
- `System.Random` is the PRNG, so a seed gives different walks in JS. Nothing needs to be compatible;
  the old lens never saved anything.
- Values are raw doubles. Nothing rounds or maps them to a musical range.

## One axis: the sampling position `s`

Drop `x`. Stratum `i` at sampling position `s` reads cell `phase0_i + speed_i · s` of its loop.
"Speed" now means one thing: how many cells the stratum advances per sample step. The old X-window
(same stride for all) is the special case where every speed is 1.

Strata are the second axis, so the field is strata × `s`: a 2D surface. A sample step reads one value
per stratum (a vertical slice); a stratum read across steps is a melodic line.

Each stratum repeats every `L_i / speed_i` steps. The module shows the **realigns every** period of the
whole field (the least common multiple of those periods as exact rationals, via `rationalFromNumber`),
the same badge Mixer shows. That is the number that tells you whether the mist ever repeats.

## Parameters

Field: `seed` (short text, hashed), `steps` N, `start` s0, `stride` Δ (default 1), `interpolation`
(linear | nearest), `map` (low, high, rounding step).

Stratum: `enabled`, `waveform` (sine | random walk), `loop` L (cells), `speed`, `phase0`, `center`
and `amplitude` (replacing baseline + clamp), `walk step` and `smoothing` for walks.

Waveforms are in [-1, 1]; `value = center + amplitude · wave`. Walks reflect at ±1, get bridged so
the loop is seamless (subtract a linear ramp so cell `L-1` meets cell 0), and smoothing wraps.
PRNG is a small seeded generator (mulberry32) in `mist.ts`, keyed by `hash(fieldSeed, stratumIndex)`.

Presets Soft Drift, Ripple, Misty Walk port over with their parameters rewritten as center/amplitude.

## Outputs

Raw doubles are not useful downstream, so the module maps them: `map` takes the full theoretical
range of the field (`center ± amplitude` across strata, not the sampled window) to `[low, high]` and
rounds to `step`. This keeps pitches stable while you scrub or change N.

| Port | Packet | Meaning |
| --- | --- | --- |
| `chords` | `list \| integer` (items are groups, one per sample step) | one group per step, one pitch per stratum: a snapshot sequence |
| `voices` | `bank \| integer` (one list per stratum) | each stratum read over the N steps: concurrent melodies |

Both carry provenance (`sample-mist` with seed, stratum, `s`) and frame `linear`, unit `abstract`,
extent N. Interpretation stays downstream: Pitch List route "read as MIDI notes", rhythm inlets'
"Interpret as rhythm", Arithmetic as is. A fractional `step` (0.5) gives microtonal MIDI values, which
Pitch List already keeps.

Open check before building: whether `list | integer` with group items is accepted by Arithmetic's
numeric broadcasting and Pitch List's pitch-group handling. Pitch groups exist; numeric groups are
described for Arithmetic but I have not traced them. If not, `chords` ships as `list | pitch` with a
`midi-note` encoding, and `voices` stays integer.

## Interface

Device layout per ARCHITECTURE.md ("panel versus inspector"):

- **Panel (shaping):** presets; per-stratum rows (waveform, loop, speed, phase, center, amplitude,
  enable); N, start, stride; Preview / Stop.
- **Inspector (setup):** seed, interpolation, output map, preview step/gate/volume, outputs summary.
- **Result:** a ridgeline plot. One row per stratum, curves drawn over the sampled window of `s`, each
  row offset vertically (rows overlap slightly, front rows occlude back rows). Vertical hairlines mark
  the N sample steps; a dot sits where each stratum is read; dot labels show the mapped value. The
  playhead follows preview. Stratum colors are `--mark-<hue>` roles from THEMING.md, never hex.
  Hovering a column highlights that chord; hovering a row highlights that voice.
- The plot is plain SVG, no new dependency. A true 3D surface (strata, `s`, value; orbit with
  drag) is deferred until the ridgeline is tried; it would be a separate component behind the same props.

Preview reuses `createPitchPreviewPlan` through `useModulePreview`, like Pitch List: a mapped MIDI
preview with its own step length, since a mist has no rhythm. The Pitch List `Register` control pattern
applies if the map is read as pitch classes later.

## Files and wiring

- `mist.ts` (pure: waveform tables, PRNG, evaluate, periods, map, packets) and `mist.test.ts`.
- `components/SwirlingMistsModule.tsx`.
- `compositionWorkspace.ts`: add `'swirling-mists'` to the module id union, label map and validator.
- `CompositionWorkbench.page.tsx`: render branch and `instanceStateKeys` entry.
- `usePersistentState.ts`: new `compositionStateKeys`; only parameters persist, tables and samples are
  rebuilt.
- `signalCategories.ts`: falls through to `numeric` with no change; revisit only if the module should
  carry its own hue.
- ARCHITECTURE.md: a Swirling Mists section after Arithmetic.

## Deliberately not in v1

Custom tables, keyframes, a second time mode, the Units label, flatten policies (ByStratum is the
`voices` bank concatenated; ByValue is a sort Arithmetic or a later list module can do), and 3D.

## Tests that matter

Determinism per seed; walk loop seam is continuous; speed 1 / loop L repeats after L steps;
realigns-every for rational speeds (e.g. loops 16 and 24, speeds 1 and 0.5 gives LCM 32);
map is stable when N changes; both packets are accepted by the real consumers (Pitch List route,
Arithmetic inlet), per the new-producer rule in memory.
