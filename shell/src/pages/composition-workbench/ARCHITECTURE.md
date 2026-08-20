# Composition Workbench Data Contracts

Status: preliminary v0.1  
Date: 2026-08-17

## Purpose

Composition Workbench modules exchange intelligible musical data. A packet describes three independent things: its structural kind, the domain meaning of its values, and the frame in which those values operate. Provenance records where each item came from and which operation produced it.

The model deliberately avoids creating a nominal data class for every module result. An interference resultant is not a special `RhythmCycle` object. It is a list of durations whose role is inter-onset spacing, framed as a cycle.

## The three axes

### Kind: how the data is structured

The preliminary structural vocabulary is:

| Kind     | Meaning                                              |
| -------- | ---------------------------------------------------- |
| `value`  | One atomic value.                                    |
| `list`   | An ordered collection.                               |
| `tree`   | A hierarchical collection.                           |
| `bank`   | A named or indexed collection of peer alternatives.  |
| `events` | Time-positioned musical events.                      |
| `layers` | Simultaneous or independently aligned streams.       |
| `curve`  | Sampled or functional values over a continuous axis. |

Kinds describe structure only. They do not imply musical meaning.

### Domain: what the values mean

Initial general domains are `integer`, `rational`, `duration`, `onset`, `pitch`, `pitchClass`, `interval`, `note`, `boolean`, `symbol`, and `text`.

The current construction engine also uses explicit operation-level domains: `cycleLength`, `pulseCount`, `phaseOffset`, `parameterFrame`, `rhythmPattern`, and `rejectedFrame`. These remain distinct where confusing them would change an operation's meaning or validity.

### Frame: where the data exists

A frame supplies context that should not be smuggled into the values:

- `topology`: `linear` or `cyclic`
- `unit`: currently `abstract`, `pulse`, `millisecond`, `beat`, or `quarterNote`
- `extent`: the length of the framed region
- `origin`: the frame's reference position
- `grouping`: optional named grouping, unit length, and boundaries

A role can further identify how a domain is being used. Current roles include `interOnset`, `generatorValue`, `pitchMaterial`, `parameter`, `pattern`, and `rejection`.

## Packet contract

```ts
interface DataPacket<T> {
  kind: DataKind;
  domain: DataDomain;
  encoding?: DataEncoding;
  role?: DataRole;
  frame?: PacketFrame;
  items: DataItem<T>[];
  metadata?: Record<string, unknown>;
  warnings: string[];
}
```

Every item has a stable ID, value, and provenance entries. Provenance identifies source module instances and source item IDs, names the transformation, and may record its parameters. Operations should preserve inherited provenance and append their own transformation.

`encoding` records how values express their domain when that distinction matters. It is separate from the temporal unit in a frame. Current pitch encodings are `midi-note`, `midicent`, `note-name`, and `chromatic-12`.

## Interference output

The Interference module emits its resultant as:

```ts
{
  kind: 'list',
  domain: 'duration',
  role: 'interOnset',
  items: [2, 1, 1, 2],
  frame: {
    topology: 'cyclic',
    unit: 'pulse',
    extent: 6,
    origin: 0,
    grouping: { /* selected Schillinger grouping */ }
  }
}
```

The interface shows the packet fields with ordinary, typeable separators: `list | duration | inter-onset | cyclic`. The values answer what occurs between resultant attacks; the frame carries recurrence and grouping. Each duration item points back to the generator or generators responsible for its starting attack.

Every authored generator is also published as a named cyclic inter-onset output. A generator pattern such as `2 1 3` retains those values and a local frame extent of `6`; it is not redundantly expanded to the resultant recurrence. Generator ports use the draft's stable ID while their displayed labels may be renumbered. Melodicization's Rhythm source input lists the resultant and every valid generator lane.

## Pitch List input and output

Pitch List reads either its inline list or a connected upstream list. A connected input always takes precedence; the inactive inline values are not combined with it.

The `Read list as` control is an explicit interpretation rather than an automatic cast:

- MIDI notes: `60, 62, 66.5` produces `list | pitch | midi-note | pitch-material`.
- Midicents: `6000, 6200, 6650` produces `list | pitch | midicent | pitch-material`.
- Note names with octave: `C4, D4, F#4` produces `list | pitch | note-name | pitch-material`.
- Pitch classes: `0, D, F#` produces `list | pitch-class | chromatic-12 | pitch-material`.

Every outer-list item is normalized to a pitch group. An unbracketed value is a one-pitch group; brackets preserve simultaneous membership, so `60 [60 64 67] 62` contains three groups and five pitches. The group remains intact through provenance and downstream transformations rather than being flattened into unrelated pitch items. Nested or unmatched brackets are rejected explicitly.

MIDI-note decimals and midicents retain microtonal precision. Note-name spelling is retained alongside a normalized midicent value used for playback. Pitch-class integers must be from 0 through 11; the interpreter does not silently apply modulo.

Pitch classes have no register. Their preview octave is a listening control only and does not change the output into concrete pitches. A later register or voicing operation must perform that conversion explicitly.

The Forte set-class catalog is an authored source for inline pitch-class material. It contains all 223 non-empty set classes of cardinalities one through twelve, using the conventional extended Fortean labels outside Forte's original cardinalities three through nine. It exposes Forte number, prime form, interval-class vector, complement, and Z-mate where applicable; `0-0` appears only as complement metadata for `12-1`. Choosing a catalog entry creates one bracketed simultaneous pitch group, never a sequence of unrelated pitch items. Transposition and I0 inversion are explicit selection parameters; neither assigns register.

Catalog insertion adds a `select-forte-set` provenance step to the affected pitch group before `read-as-pitch-class`. Manual editing deliberately clears catalog attribution because the resulting text can no longer be claimed as the catalog selection. Replacing values may change Pitch List to pitch-class interpretation; inserting alongside existing values is available only when the current pitch-class list is valid.

Preview step duration, gate, and volume are realization controls. They do not become part of the pitch-list output. Gate may extend to 200% of the step duration, allowing adjacent preview notes to overlap.

All module volume faders use the shared `VolumeControl` and gain conversion. Preview sources feed that master at nominal unity. The control maps 100% to gain 1 (0 dB), 0% to gain 0 (negative infinity dB), and reports intermediate amplitudes on the logarithmic dB scale. Modules must not compensate for the shared control with another hidden output level, fader curve, or readout. Any future musical velocity or accent data must remain explicit and separate from the module master.

## Realization and shared audio

Audio is a consumer of musical packets, not a second source of compositional data. Modules retain ownership of their typed outputs. A pure realization step combines those outputs with explicit listening controls and produces a `PerformancePlan` containing normalized, time-positioned events. The plan retains source provenance but remains separate from the persisted patch document.

Performance plans declare one of two non-interchangeable timebases:

- `musical` plans store exact rational positions and durations measured in quarter notes. They carry a tempo map, meter map, and display-tick definition. Tone schedules their onsets on its transport and resolves durations to audio-clock seconds only at the rendering boundary.
- `seconds` plans are reserved for deliberately wall-clock-based auditions, such as the current “300 ms per pitch” preview. Seconds must not be inferred for composed musical events.

Source packets may retain local temporal units such as integer pulses. Turning a pulse into a sixteenth note, beat, or other metric duration is an explicit interpretation. The shared utilities accumulate those mapped durations without floating-point drift.

The interface may present a musical position in Bitwig-style `BAR.BEAT.TICK.%` notation. Bars and beats are resolved through the meter map; the tick is a configurable display subdivision; the percentage supplies sub-tick placement. This notation is a contextual formatter and parser, not the canonical stored value. Changing the display subdivision must not move an event.

The workbench owns one lazily started `AudioEngine`. It centralizes browser audio activation, Tone.js scheduling, the master output, an instrument registry, and named buses. Each playback request returns a source-scoped session with live bus gain and independent stop behavior. Starting another preview from the same source replaces that source's prior session without stopping other modules.

Standalone rhythm and pitch modules may create provisional seconds-based audition plans. Their local step, pulse, gate, register, instrument, and metronome choices remain realization controls and do not alter their output packets. A composed rhythm-and-pitch result should instead pass through an explicit combination operation that emits `events | note` in musical time; playback must not pair unrelated packet streams invisibly.

Tone.js is contained behind the Hrifa-owned engine contract. Module components and musical operations do not import Tone classes, which keeps the realization compiler testable and leaves room for later renderers such as offline export or Web MIDI.

## Browser persistence

The workbench treats authored state as durable browser state. Construction patches, the active view and module, module inputs, interpretation and combination settings, preview controls, piano-roll viewport and inspector preferences, and live input bindings are versioned in local storage and restored on refresh. Derived packets and audio sessions are rebuilt rather than serialized.

A module's Reset control is the explicit request to replace its durable state with that module's defaults. Resetting the Construction example affects the construction patch only; it does not silently erase independently authored composition-module state.

## Compatibility and signal routing

Compatibility is checked against all required axes rather than against a module-specific class name. A receiving operation can constrain kind, domain, role, and topology.

The interface groups compatible next operations by intent:

1. **Direct operations** preserve the basic meaning while slicing, rotating, repeating, scaling, or regrouping it.
2. **Musical combinations** combine it with other material, such as assigning pitches or stacking layers.
3. **Interpretations** perform an explicit semantic or structural conversion, such as accumulating durations into onsets or building a rhythm tree.

Composition routing follows a DAW-style pull model. Source modules expose stable, named output ports but do not place routing actions beside individual lanes or outputs. The receiving module owns its input connections, and its I/O section is the single place where the user selects or changes a source. For example, Melodicization's Rhythm source selector may offer `Interference · Resultant` and `Interference · Generator 1`, while Interference itself contains no per-lane `Use in…` buttons.

Output port identity uses stable source IDs rather than display indices, so reordering lanes does not redirect a connection. Removing a connected output leaves the receiving input visibly disconnected and never silently substitutes another source. Composition-module `Use in…` shortcuts have been removed; routing is selected only at receiving inputs.

Composition view projects those explicit bindings into a numbered modular lane grid. Lanes provide neutral spatial structure rather than duplicating the packet type system: port and packet contracts remain authoritative about the material flowing through each connection. A lane context can create any number of any registered composition module. Every placement is an independent instance with a stable ID, lane, authored state, named outputs, receiver bindings, and route treatments. Its Inspector moves or removes that specific instance. Generated sinks follow their producing instance. Connections redraw around placements, so a multi-input module can share a column with either source. Removing a source leaves receiver bindings visibly missing; removing a receiver removes only the routes it owns. Moving a module never silently rewires the patch: connections remain explicit objects independent of their spatial presentation.

A route is a first-class non-destructive context between one source output and one destination input. Its context-aware Quick Adjust treatment can perform lightweight operations such as transpose, invert, retrograde, rotate, duration scaling, register assignment, and voicing without mutating the source or requiring a visible chain of primitive modules. The bottom-left Inspector edits the selected route and exposes bypass and reset. Each active operation appends named provenance to the derived packet in execution order. A treatment should be promoted to a visible module only when it must be named, reused, branched, generated dynamically, or compared independently.

Quick Adjust is generalized across a `signalTypes.ts` registry keyed by the connected packet's signal type (`pitch`, `rhythm`, or the `numeric` fallback for anything else), not by the receiving module or port name. Each entry owns its treatment shape, default, identity check, summary, and pure `apply` function; the Inspector looks up the binding's `signalType` and renders that type's editor generically, rather than each module hardcoding its own route-editing UI. A binding's `signalType` is derived from its connected source (`signalTypeFor`) and resets to that type's default treatment when rewired to a source of a different signal type. This is what lets Arithmetic's A/B inlets — which accept any numeric-ish domain rather than one fixed domain like Melodicization's rhythm/pitch — share the exact same route-binding and Quick Adjust machinery without inventing a parallel system.

The grid gives routes less visual weight than modules. An identity route is a bare but generously clickable connection; only an active treatment receives a compact summary badge beside the destination input. Multiple receivers of the same named output share one visible trunk and junction before branching. The source module reports its downstream-use count, and selecting any branch highlights and inspects that receiver-owned route. Equal-looking edge treatments remain independent unless the user explicitly promotes them to a shared processing object; visual coincidence never changes ownership.

## Modular lane grid visual conventions

Module cards size to their real content rather than a guessed fixed height: the title, subtitle, footer, and port rails are laid out in normal flow (not absolutely positioned), so a card's slot is always exactly as tall as it needs to be, and a module with inlets (e.g. Melodicization) is naturally taller than a source-only module. Grid rows share a `min-content` floor so they never clip.

Inlet and outlet port badges sit flush against the card's top and bottom edges with no gap, and are squared on the side touching the card (rounded only on the outward-facing corners), so a card and its ports read as one fused unit — like merlons on top of a castle wall — rather than separate floating chips.

Only the module title is bold. Subtitle, footer, and port badge text are all regular weight; boldness is reserved for identifying the module itself.

A card's footer is quantitative and appears only when it can name one representative fact: a single-output module shows `type | count` (e.g. Pitch List's `Pitches | 5`). A module with multiple named outputs (e.g. Interference's resultant plus its generators) leaves the footer blank rather than picking one output as though it were authoritative or restating the outlet count the port badges already show. Regardless of output count, the footer switches to reporting incompleteness or a packet warning when one exists, rendered as a filled bar using Mantine's `--mantine-color-red-filled` background with `--mantine-color-white` text — colored text alone on the panel background read as too low-contrast to register as needing attention.

## Melodicization

Melodicization is the first explicit rhythm-and-pitch combination operation. Its rhythm input must be `list | duration | inter-onset`; its pitch input accepts `list | pitch | pitch-material` or `list | pitch-class | pitch-material`. Pitch-class material receives an explicit register floor and ascending-close voicing in the selected input route before Melodicization evaluates. Those route settings remain visible, bypassable, persistent, and provenance-producing; Melodicization itself still consumes concrete pitches.

One source pulse is interpreted through an explicit musical duration such as a quarter, eighth, sixteenth, or thirty-second note. The operation accumulates those exact rational durations into note onsets and emits `events | note` with an exact musical frame. Tempo and display meter belong to preview realization and notation; changing them does not rewrite the note-event packet.

Pitch allocation is a named policy. Each pitch group consumes one rhythmic attack, regardless of how many pitches it contains:

- `cycle` repeats the pitch-group list across the rhythm spine.
- `cycle-rhythm` repeats the rhythm spine until every pitch group has played once.
- `zip` stops at the shorter input and reports the unused material rather than silently discarding it.
- `cartesian` places every pitch group at every rhythm attack, producing explicit simultaneities.

Articulation scales sounding duration from 1% through 200% while preserving each inter-onset duration. Every event retains its pitch array, inherits the rhythm and pitch-group provenance, and appends the melodicization parameters that created it. The shared audio compiler expands the group into simultaneous renderer voices only at the realization boundary.

Melodicization presents those events through the shared Shell `PianoRoll` component. The component receives display-neutral note rectangles (`start`, `duration`, and `pitchMidicents`) plus explicit bar and beat lines, so future modules can reuse it without depending on Melodicization packets or Tone.js. It provides a Bitwig-style scrollable viewport, independent time and pitch zoom, adaptive subdivisions, note fitting, a pinned keyboard and ruler, and an optional page-following playhead. Microtonal values retain fractional vertical placement rather than being rounded to MIDI semitones. The exact event table remains available as a secondary inspector.

## Arithmetic

Arithmetic ports OpenMusic's core numeric functions (`OM+`, `OM-`, `OM*`, `OM/`, `OM//`, `OM^`, `OM-E`) as one module with an operator selector, verified against OM 7.6's own reference documentation rather than assumed. All seven share the same two-inlet (A, B) shape except `eˣ` (OM-E), which is unary; `eˣ` ignores B and its own inline fallback entirely, and the module hides B's input control accordingly. A and B each accept a routed connection or, when unconnected, a typed-in fallback number seeded from that operator's own OM-documented default argument value — an unconnected inlet still produces a fully specified result, exactly as it does in OM itself.

Plain-number domains (`integer`, `rational`, `duration`, `onset`, `interval`, `cycleLength`, `pulseCount`, `phaseOffset`) are offered as A/B sources directly. `pitch` and `pitchClass` are also offered: a pitch group's bracketed pitches (a chord) are exactly the kind of nested list OM's own arithmetic recurses into — verified against OM 7.6's kernel.lisp, where `om+`'s list+list method is a CLOS-dispatched `mapcar` with no special "list mode," so a leaf number broadcasts across every pitch in a group and two groups pair up the same way two top-level lists do. `note` is the one domain excluded: its items are full event objects (onset/duration/velocity), not a number or a group of numbers, so there is nothing to decompose.

A and B are never required to share a domain. OM's `om+` has no concept of domain at all — it dispatches purely on Lisp type (number vs list) and combines whatever it's given. When A and B's domains agree, the result keeps that meaning (e.g. two `duration` lists stay `duration`); when they disagree, the result's domain falls back to a neutral `integer` rather than silently claiming to still be whichever domain happened to be A's — the packet stays honestly typed even though what it now represents is up to whoever connects it next. A grouped side's structure survives a mismatched combination too: a one-pitch group added to a plain number still comes out as a one-element array, not unwrapped to a bare number, matching Lisp's own `(om+ 1 '(60)) => (61)`.

Combination follows OM's own documented broadcasting: a scalar broadcasts over a list unambiguously, and two equal-length lists always pair elementwise. Only when A and B are both lists of *different* lengths does the module ask which alignment policy to use, reusing Melodicization's same `cycle` / `cycle-rhythm` / `zip` / `cartesian` vocabulary (relabeled generically, since A and B are symmetric operands rather than a rhythm-anchored spine). Divide and floor-divide by zero report a warning and produce `Infinity`/`NaN` rather than aborting the packet, matching how Melodicization's Zip already reports unused material instead of refusing to run.

The module also shows the raw numbers actually being combined (`A raw` / `B raw` / `Result raw`), decomposed via the exact same function the computation itself uses (`rawNumericTree`), not a separately re-derived display value — so what's shown can never silently drift from what's really happening, and a route's hidden defaults (like a pitch-class register floor) are never invisible.

Pitch-class connections default to staying raw pitch-class (`voiceAsPitch: false` on the route's Quick Adjust) rather than being silently voiced into a concrete MIDI register — a route stays connected and transpose/invert/retrograde/rotate still apply, but nothing forces a register floor unless the user explicitly turns it on. Consumers that require concrete pitch, like Melodicization, need that flag on for that specific route.

An optional modulo post-process — a toggle plus divisor, applied to the module's output after the arithmetic operation — is a reusable building block (`moduloTreatment.ts` + `ModuloControl.tsx`) rather than something inlined into Arithmetic specifically, following the same shared-component precedent as `VolumeControl.tsx`.

## Rules for extending the vocabulary

- Add a kind only when the structure is genuinely different, not because a new module produced it.
- Add or refine a domain when substituting another domain would change musical meaning or validation.
- Keep topology, extent, unit, origin, and grouping in the frame rather than encoding them into a nominal type name.
- Make conversions explicit and inspectable. Do not silently reinterpret, clamp, or discard values.
- Preserve source item identity and provenance through direct operations.
- When streams must align, expose the alignment policy (`zip`, `cycle`, `cartesian`, or another named rule).
- Keep rejected parameter frames and reasons available instead of silently dropping invalid combinations.

## Relationship to OpenMusic

This structure follows OpenMusic's useful separation between ordinary data and musical objects, and its use of typed inputs to constrain valid connections. Composition Workbench keeps that flexibility while representing meaning and temporal context as composable packet axes rather than requiring a large class hierarchy.

References:

- [OpenMusic data types](https://openmusic-project.github.io/openmusic/doc/Tutorials/concepts.data-types)
- [OpenMusic musical objects](https://openmusic-project.github.io/openmusic/doc/om-manual/OMRT)
- [OpenMusic class reference](https://openmusic-project.github.io/openmusic/doc/Tutorials/classref.main.html)
