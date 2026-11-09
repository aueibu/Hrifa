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

### Mathematical background: what these operations actually are

Binary synchronization (`r_{a÷b}`, Schillinger ch. 2, implemented in `interference.ts`) is not a Schillinger-specific invention: unioning two arithmetic progressions of spacing `a` and `b` inside a window of length `ab` is the classical construction of a **Christoffel word** — equivalently, marking where a straight line of slope `a/b` crosses the horizontal and vertical lines of an integer grid (the same idea behind Bresenham's line-drawing algorithm). For coprime `a, b` the result has exactly two duration values arranged palindromically; that is precisely the **balance property** the Morse–Hedlund theorem uses to characterize Sturmian sequences, and it is the periodic (rational-slope) case of the same cut-and-project construction that generates aperiodic quasicrystal tilings at irrational slopes. Godfried Toussaint's *"The Euclidean Algorithm Generates Traditional Musical Rhythms"* (2005) traces this same territory and cites Schillinger's interference-of-periodicities as a precursor to what he calls Euclidean rhythms (Bjorklund's algorithm — see the separate `euclidean-rhythm` module in Construction). The two constructions are not identical — Euclidean rhythms distribute `k` onsets maximally evenly among `n` slots; Schillinger's resultant unions two independent clocks — but they frequently coincide for coprime pairs and are worth cross-checking against each other rather than treated as unrelated.

Fractioning (ch. 4, `fractioning.ts`) has no equally canonical name in the literature. Its "restart at every block boundary" mechanic is what breaks the self-similarity that makes Christoffel words special, so it is best understood as a Schillinger-specific device rather than an instance of a known object — though it's structurally close to running-bond (staggered) brick tiling, and to interleaving techniques in coding theory/DSP that deliberately stagger a repeating sub-pattern across block boundaries.

Pair composition (ch. 5, `pairComposition.ts`) is a formal/structural device — concatenating and padding statements to a balanced length — closer to classical antecedent-consequent phrase pairing than to a distinct mathematical object.

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

**Looping.** `PlaybackRequest.loop` repeats a musical plan seamlessly until stopped, using Tone's transport loop points over one pass (the plan's own `duration`, not the click-extended length `applyTransport` produces). A count-in sounds once, before the loop begins; the meter click restarts each pass. Loop points are whole ticks, so a pass that is not a whole number of ticks (a 7-tuplet at 960 PPQ) is rounded, drifting under half a tick per pass. `onComplete` never fires for a looping session, `clock()` reports `loopSeconds` for a wrapping playhead, and stopping releases the global loop. Seconds plans cannot loop. The mixer sets `loop` from its `loopable` result.

Standalone rhythm and pitch modules may create provisional seconds-based audition plans. Their local gate, register, and instrument choices remain realization controls and do not alter their output packets.

**Global transport.** Tempo, meter, pulse value, metronome, and count-in are workbench-wide settings (`transport.ts`, stored in `compositionSettings.tsx`, edited in the header `TransportBar`). Every rhythm preview takes its pulse length from the transport (`pulseSeconds`) instead of a per-module unit, and passes `followTransport: true` so the engine adds meter clicks (on the `meter` bus, whose gain is the metronome switch, so it toggles live) and an optional one-bar count-in. Melodicization's tempo, display meter, and pulse value are the transport's, so its note output follows the global pulse value. Interference's grouping click is a separate `grouping` bus layered on the meter click. Pitch List keeps its own step length, since a pitch list has no rhythm. **Preview voices.** `sounds.ts` defines two global voice sets (rhythm and metronome), each a base pitch plus primary/secondary/tertiary voices with a sound type (click, woodblock, drum, tone) and a cents offset. Modules play layer *n* on voice *n* (`layerSound`) unless the module stores its own `SoundOverride` for that layer (`SoundOverrideControl`): Interference per generator, Rhythm Householder for input (A) and candidate (B, plus an A/B button that plays both), Fractioning and Pair Composition for their single rhythm. Meter clicks use the metronome's primary (downbeat) and secondary voices; Interference's grouping click uses its tertiary. Percussive types sound in a fixed register relative to the written pitch (`soundRegisterSemitones`). Modules register their main preview with `useTransportPreview` so the header Play button and the space bar start the selected module; Stop and space-while-playing stop every preview. A composed rhythm-and-pitch result should instead pass through an explicit combination operation that emits `events | note` in musical time; playback must not pair unrelated packet streams invisibly.

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

Composition view projects those explicit bindings onto a free patch canvas (React Flow). Position is pure presentation: port and packet contracts remain authoritative about the material flowing through each connection. The canvas header's Add module menu is the single place to create any number of any registered composition module. Every placement is an independent instance with a stable ID, an `x`/`y` canvas position, authored state, named outputs, receiver bindings, and route treatments. Its Inspector removes that specific instance; dragging moves it. Generated sinks follow their producing instance. A new module takes the first free slot, never landing on another. Removing a source leaves receiver bindings visibly missing; removing a receiver removes only the routes it owns. Moving a module never silently rewires the patch: connections remain explicit objects independent of their spatial presentation.

Tidy (`compositionLayout.ts`, pure and unit-tested) rearranges positions only. It layers modules by dependency depth so signal reads top to bottom, orders each layer by the average position of its sources to limit crossings, and centres the layers. Cycles are ignored for layering rather than looping. Projects saved with the earlier `laneId`/`row` grid are migrated on load (`migrateCompositionInstances`: 200 units per lane, 170 per row) so they open with the same arrangement.

A route is a first-class non-destructive context between one source output and one destination input. Its context-aware Quick Adjust treatment can perform lightweight operations such as transpose, invert, retrograde, rotate, duration scaling, register assignment, and voicing without mutating the source or requiring a visible chain of primitive modules. The bottom-left Inspector edits the selected route and exposes bypass and reset. Each active operation appends named provenance to the derived packet in execution order. A treatment should be promoted to a visible module only when it must be named, reused, branched, generated dynamically, or compared independently.

Quick Adjust is generalized across a `signalTypes.ts` registry keyed by the connected packet's signal type (`pitch`, `rhythm`, or the `numeric` fallback for anything else), not by the receiving module or port name. Each entry owns its treatment shape, default, identity check, summary, and pure `apply` function; the Inspector looks up the binding's `signalType` and renders that type's editor generically, rather than each module hardcoding its own route-editing UI. A binding's `signalType` is derived from its connected source (`signalTypeFor`) and resets to that type's default treatment when rewired to a source of a different signal type. This is what lets Arithmetic's A/B inlets — which accept any numeric-ish domain rather than one fixed domain like Melodicization's rhythm/pitch — share the exact same route-binding and Quick Adjust machinery without inventing a parallel system.

The canvas gives routes less visual weight than modules. An identity route is a bare but generously clickable bezier cable; only an active treatment receives a compact summary badge on the cable. Each cable leaves its source's outlet and enters the receiver's inlet at the exact port tip, and every receiver of an output gets its own cable (there is no shared trunk or junction). The source module reports its downstream-use count on its outlet. Selecting a cable highlights and inspects that receiver-owned route; selecting a module emphasises every cable in its upstream and downstream flow. Equal-looking edge treatments remain independent unless the user explicitly promotes them to a shared processing object; visual coincidence never changes ownership.

## Patch canvas visual conventions

Inlets sit on a card's top edge and outlets on its bottom edge, as in Max, Pd and OpenMusic, so signal reads top to bottom. Each port carries an invisible React Flow handle at its outer tip. Until the browser has measured a card, estimated handle positions keep cables drawn roughly right; once measured, the real positions win (the estimates are dropped from the node, otherwise every re-render would reset them).

Module cards have a fixed width (`NODE_WIDTH`) and size their height to real content rather than a guessed fixed height: the title, subtitle, footer, and port rails are laid out in normal flow (not absolutely positioned), so a module with inlets (e.g. Melodicization) is naturally taller than a source-only module. Wheel scrolling pans the page, not the canvas; hold Ctrl or Cmd to zoom with the wheel.

Inlet and outlet port badges sit flush against the card's top and bottom edges with no gap, and are squared on the side touching the card (rounded only on the outward-facing corners), so a card and its ports read as one fused unit — like merlons on top of a castle wall — rather than separate floating chips.

Only the module title is bold. Subtitle, footer, and port badge text are all regular weight; boldness is reserved for identifying the module itself.

A card's footer is quantitative and appears only when it can name one representative fact: a single-output module shows `type | count` (e.g. Pitch List's `Pitches | 5`). A module with multiple named outputs (e.g. Interference's resultant plus its generators) leaves the footer blank rather than picking one output as though it were authoritative or restating the outlet count the port badges already show. Regardless of output count, the footer switches to reporting incompleteness or a packet warning when one exists, rendered as a filled bar using Mantine's `--mantine-color-red-filled` background with `--mantine-color-white` text — colored text alone on the panel background read as too low-contrast to register as needing attention.

## Melodicization

Melodicization is the first explicit rhythm-and-pitch combination operation. Its rhythm input must be `list | duration | inter-onset`; its pitch input accepts `list | pitch | pitch-material` or `list | pitch-class | pitch-material`. Pitch-class material receives an explicit register floor and ascending-close voicing in the selected input route before Melodicization evaluates. Those route settings remain visible, bypassable, persistent, and provenance-producing; Melodicization itself still consumes concrete pitches.

Any rhythm inlet — not just Melodicization's — applies the same route-level "Interpret as rhythm" opt-in that pitch inlets already use for `readAsMidiNotes`. A connected source that isn't already `list | duration | inter-onset` (Arithmetic's output, for instance, never carries a role) passes through unconverted until this is explicitly turned on. Turning it on only succeeds for a bounded, honestly-numeric set of domains — `integer`, `rational`, `duration`, `onset`, `interval`, `cycleLength`, `pulseCount`, `phaseOffset` — and only when every item is already a bare, finite, positive number; pitch/pitchClass/note material and any grouped (chord-shaped) value are refused rather than guessed at. A refusal reports why as a packet warning instead of partially converting or silently discarding the offending items, and the connected inlet's own error remains the visible symptom until the toggle is turned on or a valid source is connected.

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

## Where a rhythm starts

An inter-onset list says how far apart attacks are, not where the first one falls. That lives in the frame's `origin`: the first attack's position in frame units, measured from the downbeat (`rhythmFrame.ts`). Origin 0 is a downbeat start. In a cyclic frame `0 ≤ origin < cycle`: the durations still sum to the cycle, and the last one wraps into the next cycle's first attack, so a loop starting on pulse 2 sounds its first two pulses as the tail of the previous cycle. In a linear frame, origin is a leading rest and `extent = origin + Σ durations`.

- Rhythm routes have a **Start offset** Quick Adjust, in pulses after scaling. It wraps in loops; in a linear frame, starting before the downbeat is clamped with a warning. Retrograde and rotate reorder durations and keep the first attack at the rhythm's start. Duration scale scales the start along with the durations. Routes saved before offsets existed read as offset 0.
- Melodicization shifts every attack by the start; bar lines do not move, which is what places the attacks off the beat. Duration previews play the leading silence.
- A bank whose entries start in different places lists them in `metadata.entryOrigins`, and selecting an entry gives the resulting list that entry's start.
- Output summaries show `starts +n` for a rhythm that doesn't start on the downbeat.

## Rhythm realization

Status: implemented in `rhythmRealization.ts`. Interference, Fractioning, Pair Composition and Rhythm Householder previews all realize through it (`createRhythmPreviewPlan`, `createInterferencePreviewPlan`), and Mixer compiles `materialFromRhythmPacket` against the same function. The rests-and-ties encoding below is supported by the function but not yet by packets.

**Principle.** A rhythm packet is data in its own unit (usually pulses). Realization is the one explicit step that gives it musical time, a voice, and an articulation. This follows OpenMusic's split between a rhythm and the container that interprets it: an RT carries proportions, while the container's `Qvalue` (an abstract unit, 1/qvalue of a quarter note) and `QTempo` give those units a physical meaning. Here the equivalents are the transport's pulse value and tempo. Tempo is never part of the realization; the engine's timeline resolves it.

**Contract.** One pure function turns a rhythm packet into musical-time events:

- **In:** a `list | duration | inter-onset` packet (with its frame), the musical duration of one pulse (from the transport's pulse value), a resolved voice (`layerSound`), and optional channel parameters: start offset and gate.
- **Out:** events with exact rational `at` and `duration` in quarter notes (`MusicalPerformanceEvent`), a `busId`, and provenance pointing back to the source items. A `MusicalPerformancePlan` is built from them.
- **Frame.** `origin` becomes a leading offset, in pulses mapped through the same pulse value. A cyclic `extent` is reported as the loop length but never unrolled here. Unrolling to a horizon, and the loop policy that governs it (`free`, `restart with longest`, `once`), belong to whoever compiles several sources into one plan (Mixer), not to this function.
- **Not in the contract:** tempo, metronome, count-in and looping. Those belong to the transport and the engine.

**Gate.** Gate sets how long an event sounds as a percentage of the time slot to the next attack, from 1% through 200%, as in Melodicization's articulation and Pitch List's gate. It is a realization parameter, never part of the packet. OpenMusic likewise keeps legato on the playing object (chord-seq), not in the rhythm. The default is 95%: connected but not blurred, like a pianist's legato where each note releases just before the next attack. Percussive voices decay on their own and barely depend on it, while sustained voices (`tone`, sine) need a musical gate so their length scales with the pulse. The old fixed 0.12 s cap has no musical equivalent and is not carried over. A gate applies to the whole sounding span of an event, which for tied notes is the full tied length.

**Rests and ties (proposed).** Inter-onset lists have no way to say "silence" or "continue the previous note". OpenMusic encodes both in the rhythm tree itself: a negative number is a rest and a float is a tie (`(1 1.0 -1 1)`). Rests and ties are rhythm data, not articulation, so they belong in the packet.

- **Rest:** a negative duration. Its magnitude is the length of silence, `-2` is a two-pulse rest. It consumes time like any other item but produces no event.
- **Tie:** JavaScript cannot tell `1.0` from `1`, so OpenMusic's float convention cannot be copied. Instead a tied item carries an explicit flag, `tie: true`, on the `DataItem`. A tied item produces no new attack. It extends the preceding sounding event by its own duration. A tie directly after a rest, or as the first item of a linear packet, is invalid and reported as a warning, not silently dropped.
- **Compatibility.** A rhythm containing rests or ties is not interchangeable with one that does not. Consumers that assume positive durations (Arithmetic's numeric domains, the Householder and Fractioning arithmetic, Interference's own sums) must declare that they accept them. Until they do, such a packet is not offered at their inlets, rather than being silently reinterpreted. The "interpret as rhythm" opt-in stays the explicit place where a numeric source becomes a rhythm.
- **Relation to start offset.** `frame.origin` and a leading rest describe the same silence. A cyclic frame keeps `origin` because the wrap-around semantics differ (see "Where a rhythm starts"). Modules may emit a leading rest instead where that is clearer, and realization treats the two identically.
- **Totals.** Rests count toward the span (`Σ|d|`) and ties do too. A cyclic frame's `extent` must equal that sum.

Open decision: the exact home of the tie flag (a typed optional field on `DataItem` restricted to inter-onset lists, versus `packet.metadata`).

## Mixer

The Mixer auditions several ideas together: a preview layer one step before a committed arrangement, not a timeline. It is a sink. It publishes no outputs and, for now, no `layers` packet; what a committed multi-stream packet should be needs more thought.

- **Channels are its inlets.** The receiver's route state is the single source of truth for which channels exist and in what order. Each channel is one port with a stable id (`ch-…`, never a display index), shown as `Ch 1`, `Ch 2` by position. Adding or removing a channel adds or removes a route binding; its persisted settings (`mixerChannels`) are pruned to match. Because route bindings are ordinary, each channel gets Quick Adjust (a rhythm channel's retrograde, rotate, duration scale and start offset) before it is mixed.
- **What a channel plays.** An `events | note` stream plays directly; an inter-onset rhythm is realized on a rhythm voice through the shared rhythm realization (voice by channel position unless overridden, gate default 95%). A numeric list must be explicitly interpreted as rhythm on its route; a pitch list has no rhythm and is reported, never guessed at.
- **Loop policies** (`mixer.ts`, per channel): `free` repeats at the channel's own period, so together the free channels repeat every least common multiple of their periods, the realignment period (the meta interference pattern); `restart with longest` cuts and restarts together at the longest looping cycle's end; `once` plays a single time. A start offset rotates a looping channel (as cyclic `origin` does) and delays a one-shot. The realignment period is shown beside the module.
- **One plan, one transport start.** Play compiles every channel into a single musical-time plan with the mixer's instance id as `sourceId`, so channels stay phase-locked, and loops it (`PlaybackRequest.loop`) when it is exactly one period of the pattern. A realignment beyond the horizon (128 bars of 4/4) or an oversized event count is truncated or refused with a warning, not unrolled silently. A truncated mix is flagged (`truncated`), plays once without looping, and is captioned in the module as a preview: the "realigns every" badge still reports the true period, but the progress bars measure progress through the preview, not toward the true sync.
- **Composite roll.** The shared `PianoRoll` draws every event of the compiled plan (`mixerRoll.ts`), each note colored by its channel (a note may carry its own `color`; the channel hue follows its position and never uses the red of the playhead), so the roll shows what will be heard, including loop repeats. Rhythm channels sit at their voice's sounding pitch, which makes the roll a piano roll and a percussion roll at once. Past 4,000 events it draws a sample and says so. The playhead follows the engine's clock and wraps at the pass length while looping, so every channel's hits line up against one moving line. Each channel header shows its kind, event count and length in pulses and bars.
- **Per-channel lanes.** A toggle switches the roll from the composite to one lane per channel, each showing that channel's own cycle (rotated by its offset, or delayed for a one-shot) with its own playhead, as clips are shown in a clip launcher. All lanes share one time scale, so a short cycle is visibly shorter than a long one; each lane fits its own pitch range. The scale fits the longest lane by default and can be zoomed. Each lane's playhead is derived from the mix's position within its pass: a free channel wraps at its own period, a restart-with-longest channel resets at each block of the longest cycle, a one-shot runs once and holds. Each looping channel also has a progress bar (on its lane, or at the top of its strip in the composite view) that fills across the whole pass from one sync point to the next, with a tick at every cycle boundary: every channel fills at the same rate, and what differs is where its ticks fall (a free channel ticks at its own cycles, a restart-with-longest channel at its restarts; a one-shot has no bar). While playing the header reads "cycle 5 of 15", and the toggle row shows the pass count. Pure helpers: `mixerLane`, `laneView`, `lanePlayhead`, `cycleProgress` in `mixerRoll.ts`.
- **Levels.** Each channel has its own bus. Level, mute and solo are live and combine with the master fader; the loop policy, offset, gate and sources apply on the next Play.

## Rhythm Householder

Rhythm Householder (`householder.ts`) alters a rhythm along a chosen bias axis while keeping its attack count and total span. It takes a rhythm inlet (`list | duration | inter-onset`, with the usual route-level "Interpret as rhythm") and an optional numeric `axis` inlet. It publishes `selected` (an ordinary inter-onset list) and `candidates` (`bank | duration | inter-onset`, one durations array per entry), both keeping the input frame. Attack j of a candidate inherits the provenance of input attack j, since both modes keep attack order.

- **Reflect** works in duration space: `d' = d + (c − 1)(q·d / q·q)q` with the axis `q` centered so `Σq = 0`. `c = −1` is the exact Householder reflection, `0` removes the component, and `1` is the identity. The total is preserved by construction, and every component orthogonal to `q` is untouched. Presets: trend (index ramp), swing (alternation), arch (parabola), a custom contour, or a routed list, which takes precedence. When the exact reflection would push a duration below the minimum, the module uses the nearest valid rhythm (a simplex projection) and reports the realized coefficient. Rounding to the grid uses largest-remainder rounding, so the total stays exact. Note that a palindromic rhythm, such as any interference resultant, has no trend or swing component: reflecting it along those axes is the identity, and the module says so.
- **Metric** works on onset slots: each enabled axis (a repeating per-slot accent pattern, or early/late position) is centered over the span, and its bias is the sum at the attack slots. The target is `c ×` the input bias, clamped to the reachable range (with a warning). The score is the weighted, range-normalized distance to each target, plus a "keep identity" penalty and a "stay close" penalty. Keep identity measures the share of attack pairs whose distance changed, using the rhythm's interval content (the rhythmic analogue of an interval-class vector, wrapped around the cycle in cyclic frames). It therefore favours displacing the whole rhythm over reshaping it: a rotation moves every attack but changes no interval. Stay close penalizes attack movement directly. Because single-attack moves can never reach a rotation, local search scores every attack rotation and also descends from the best few. By default the start is free: candidates may begin anywhere in the frame, and each candidate's start travels with it as the output's `origin`. Loops are also seeded with every time-shift of the input, which is classic displacement. "Keep the start where the input's is" pins the first attack instead. The search is exhaustive up to 100,000 attack sets and local search from the input beyond that, and the module reports which one it used.

This replaces a C# prototype whose greedy search barely depended on the input rhythm, whose flips cancelled out in the scoring, and whose reflected onset field was dominated by the input's own spikes.

## Adding a module with playback

The default for any new module that previews sound. Fractioning is the smallest complete example;
Rhythm Householder shows layered (A/B) playback. Two shared pieces do most of it:
`useModulePreview` (`useModulePreview.ts`) runs the preview, and `DurationStrip`
(`components/DurationStrip.tsx`) draws the numbered bar with its playhead.

1. **Timing comes from the transport.** Rhythm previews build a musical-time plan with
   `createRhythmPreviewPlan` and `transportRhythmContext(settings.transport)` (pulse value and
   timeline); `musicalPlanSeconds(plan)` gives the length for a status line. `pulseSeconds` remains
   only for drawing a playhead. Don't add a per-module tempo, unit, or meter control. Musical-time plans
   (Melodicization) use the transport's tempo, meter, and pulse value.
2. **Play through `useModulePreview`.** It stops the previous session, keeps the volume and any
   extra buses live, owns the status line (`preview.status`), and clears playing state on a global
   Stop. Pass `followTransport: true` for anything on the transport's pulse grid, so the metronome
   and count-in apply; leave it off only for previews with no pulse (Pitch List). Module-owned
   playback state (highlighted layers, a custom playhead) is cleared in `onEnd`.
3. **Sounds come from the voices.** Play layer *n* on `layerSound(settings.sounds.rhythm, n, override)`
   and give each layer a `SoundOverrideControl` with the override in the module's persistent state
   (default `null` = use the voice). Don't hard-code an instrument or pitch for a rhythm layer.
   Two layers you'd want to compare get an A/B button
   (`createRhythmPreviewPlan` with one layer each).
4. **Give the hook a `transportPlay`** for the main preview, so the header Play button and the
   space bar start it.
5. **Draw durations with `DurationStrip`** and pass `playhead={{ sourceId, unitSeconds }}`; it
   handles late starts and the playhead. With several strips, set `playhead.visible` for the ones
   actually sounding. For any other display (e.g. Interference's attack lanes), add
   `<Playhead … />` as the container's **last** child (`durationBlock` colors alternate with
   `:nth-child`).
6. **Give the module its own volume fader** (the hook's `volume`, on the `preview` bus). The
   `meter`, `count-in`, and `grouping` buses are reserved for clicks.
7. **Use the module's instance id as the plan's `sourceId`.** The playhead, global Stop, and
   `stopSource` all find a preview by it.
8. **Store new persistent keys** in `compositionStateKeys` and list them under the module's
   `instanceStateKeys` in `CompositionWorkbench.page.tsx`, so deleting the module clears them.

Global Stop (header button or space while playing) ends sessions without calling `onComplete`;
`useModulePreview` notices and calls `onEnd('stopped')`, so don't play through `audioEngine.play`
directly from a module.

## Direction: rolling playback and arrangement

The end goal for playback is a **rolling scheduler**, and the arrangement view is what will need it. Today a `PerformancePlan` is a finished, finite list of events that the engine schedules up front. That suits a short plan (a mixer pass, a single module's preview), but a timeline arrangement needs the engine to ask for events as time advances: edit while playing, jump to a position, loop a region, change tempo, and open a large project without building every event first. DAWs work this way, scheduling a short lookahead window ahead of the audio clock.

The mixer's long-period case is the same problem. A clip launcher never computes the least common multiple of its clips' lengths: each clip keeps its own loop and its next repeat is scheduled as it comes up, so the realignment simply happens. The mixer's `free` loops already have those semantics; unrolling one realignment pass is a workaround for not having a rolling scheduler.

The shape this implies:

- **A window function.** Compiling a mix, and later an arrangement, answers "which events fall in time A to B?" instead of "give me the whole plan". Today's finite plan is the special case A = 0, B = pass length. Free and restart-with-longest loops are cheap to window; arrangement clips are windowed by their position.
- **A scheduler in the engine.** A timer wakes ahead of the audio clock, asks the window function for the next bars, and schedules them on the transport. Events land on their own ticks, so the whole-tick rounding of a looped pass goes away. The scheduler must tolerate a late timer without dropping notes.
- **Live edits, seek and loop regions** become rules about when a changed source takes effect and from where the window restarts. Today's rule, that edits apply on the next Play, is a simplification the scheduler replaces.
- **The roll becomes a view onto a window**, not a full draw of one pass.

Stopgaps to treat as stopgaps, working and tested but not to be deepened: `PlaybackRequest.loop` and its transport loop points, the mixer's horizon and truncated pass, and the whole-pass unrolling in `compileMixerPlan`. The window function and scheduler should replace them, with the loop path kept only where a short seamless pass is genuinely simpler.

An arrangement also needs what streaming alone does not give: a timeline model (clips, positions, lanes, a tempo and meter map), editing, and committed multi-stream packets. What a committed multi-stream packet is (the `layers` kind) is deliberately undecided; see the Mixer section, which publishes none.

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
