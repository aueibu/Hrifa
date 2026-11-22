# Hrifa Lexicon

The canonical list of the words this project uses: the prefixes, the
quasi-math way the work is organized, the musical terms, and the Hrifa world.
It covers both systems in this repo (the legacy applets and `shell/`).

Started 2026-11-22 from the human's request: "a canonical list of those terms
and phrases I have been using / exploring here". Built from a sweep of the repo
docs and of the human's own messages in past sessions.

## How to read an entry

Every entry has a **status**, using the labels the `_Ideas` docs already use:

| Status | Meaning |
|---|---|
| **DECIDED** | The human has used it this way, or it is written into a canon, an ARC or `DECISIONS.md`. |
| **LEANING** | Proposed here, fits existing usage, not yet confirmed by the human. |
| **OPEN** | Named but not defined yet, or two readings are still live. |
| **RETIRE** | Proposed to stop using; the replacement is given. |

**Source** says where the word came from: *human* (your coinage), *Claude*
(coined in a design conversation, see `_Ideas/Workbench-UI-Musings.md`),
or a borrowed source (*Schillinger*, *Wallin*, *Hindustani*, *Scala*, *math*).

To change an entry, edit it and add a line to the change log at the bottom.
Same rule as `DECISIONS.md`: don't silently rewrite meaning.

---

## 1. The prefix grammar

Each prefix gets one job, so a new coinage can be checked against a single
question.

| Prefix | Its one job | The test question | Status |
|---|---|---|---|
| **meta-X** | An X made of Xs, or an X that acts on other Xs. One level *up*. | "Is this a whole X treated as a single new X?" | DECIDED |
| **macro-X / micro-X** | The *same* X at a much larger or smaller scale (time span, pitch size). Not a new level, just another size. | "Is this the same mechanism, slower/faster or wider/narrower?" | LEANING |
| **ur-X** | The latent, generative form of X that a structure already carries before anything is played. What every realization is a realization *of*. (After Goethe's *Urpflanze*.) | "Does the structure *imply* an X without anyone composing one?" | LEANING |
| **quasi-X** | A borrowed concept used by deliberate analogy, with the differences known and accepted. Inspired-by and hybrids. | "Are we using X's shape on purpose while knowing it isn't really X?" | LEANING |
| **proto-X** | A literal earlier version of the same thing. | "Is this the predecessor that X replaced or will replace?" | LEANING |
| **pseudo-X** | Implies fake or mistaken. | — | RETIRE → **quasi-** (or **ur-** if the form is latent rather than borrowed) |

### Existing words, sorted by the grammar

| Word | Where | Fits? | Note |
|---|---|---|---|
| **meta chord** | `shell/arcs/workbench/PROPOSAL.derivation-graph.md` | yes (meta) | A fitted chord plus its span's two notes, heard as one new chord. A chord of chords. |
| **meta-level Z-relation** | human, 2026-11-21 | yes (meta) | "the entire structure is considered (not just stopping with the octave equivalence)". Z-relation applied to whole structures. |
| **meta lane / meta-clip arranger lane** | `shell/BACKLOG.md` (D4), workbench ARC | yes (meta) | A lane that holds structure *about* the other lanes (per-section EDO, key snap, rhythm structure). |
| **meta-layer / meta-level** | `_Ideas/Workbench-UI-Musings.md` §4.5 | yes (meta) | Features that act on other features. |
| **meta ring / "Near" meta ring** | `shell/arcs/harmonic-field-lab/ARC.scala-tools.md` (M8d) | borderline | An overlay on the ring showing all ratios near a clicked interval. A ring *about* one interval of the ring, so meta holds, loosely. Keep. |
| **meta-grid** (53 counted 10 × 5 + 3) | `_Ideas/Rhythm-As-Pitch/Ratio rhythm timeline and canon.md` | no → **macro-grid** | It is the same kind of grid, used as a slow structural layer. Same thing, bigger scale. Proposed rename, LEANING. |
| **meta-tab** | `shell/arcs/workbench/DESIGN.one-stage.md` | no | It switches screensets; it is not a tab of tabs. Prefer **screenset tab**. LEANING. |
| **micro-step, microtonal** | canon; human | yes (micro) | Ordinary sense. |
| **quasi-solarized** | `quasi-solarized-theme.html` (legacy) | yes (quasi) | A riff on Solarized: its shape, deliberately not it. |
| **quasi-math** | human, 2026-11-22 | yes (quasi) | The canon / decision way of organizing work (section 2). |
| **Quasi-equal, Quasi-augmented** | Harmonic Field Lab chord library | n/a | Names from the Scala chord list. Not project coinages; leave as is. |
| **ur-chalan / ur-pakad** | human + Claude, 2026-11-22 | yes (ur) | What the placement rules and hung tones imply (section 4). Replaces "pseudo pakad / chalan". |
| **legacy applet → shell port** | `CLAUDE.md` | yes (proto) | A legacy applet is the **proto-** version of its future shell port. Use when naming the pair. |

---

## 2. Quasi-math: how the work is organized

Project work borrows the shape of mathematical writing: a canon of settled
facts, numbered results, decisions that can be superseded but never erased.
That's the quasi-math parallel.

### Settled knowledge

| Term | Meaning | Status |
|---|---|---|
| **canon** | The settled, corrected statement of each mechanism, numbered (Canon 1–6 in `_Ideas/Rhythm-As-Pitch/Ratio rhythm timeline and canon.md`). The source of truth. **Math facts only**: names, formats and UI are not canon. A canon is a snapshot: compare it with the live apps before acting on names. | DECIDED |
| **theorem / bound** | A numbered result inside a canon, with a proof or an exhaustive search behind it (e.g. *Factor law*, *Pentagon rigidity*). | DECIDED |
| **canonical** (data) | The authoritative implementation or dataset, e.g. "`zgen.py` is canonical for family counts". | DECIDED |
| **conjecture** | A claim supported by search but not proved (e.g. "small lopsided tiling canons do not exist at 12, 16, 18 (searched)"). Gives searched-but-unproved results a home before they become theorems. | LEANING |
| **lemma** | A smaller result used to prove a theorem. Use only if a canon starts needing it. | OPEN |
| **axiom** | The ground assumptions a canon is built on: octave equivalence or not, JI or EDO, which ring reading. Stating them once would make the "meta-level Z-relation" (dropping octave equivalence) a clean change of axiom. | LEANING |

### Decisions and their statuses

| Term | Meaning | Status |
|---|---|---|
| **decision** | A row in `shell/DECISIONS.md`, prefixed by its arc (W-, S-, H-, STAGE-, INTERVALPLACEMENT-, RATIORHYTHM-). Append-only. | DECIDED |
| **active / superseded by \<id\> / reverted** | A decision's lifecycle. To change one, add a new row and point the old row at it. | DECIDED |
| **OPEN → LEANING → DECIDED, REJECTED** | The idea-stage ladder in `_Ideas` docs. LEANING = the human favored it, or Claude recommended it and the human did not object. This lexicon uses the same ladder. | DECIDED |
| **checkpoint** | A planned stop for the human inside an arc; the answers are written back into the ARC. | DECIDED |

### Units of work

| Term | Meaning | Status |
|---|---|---|
| **arc** | A body of work with a goal, constraints and small milestones with checkable acceptance criteria (`shell/arcs/<name>/ARC.md`). Finished arcs are archived as `ARC.<topic>.md`. | DECIDED |
| **workstream** | The `arcs/<name>` folder that holds one arc at a time. | DECIDED |
| **milestone** | One builder-sized step. **C0** = context scan (always first), **M1, M2…** = milestones, letters = sub-steps (M8d), **R1–R3** = runtime milestones. | DECIDED |
| **side study** | Work run outside an arc's milestones (e.g. rhythm crystals, required-interval explorer). | DECIDED |
| **proposal** | A written idea that is not yet an arc (`PROPOSAL.*.md`). | DECIDED |
| **spike / mock** | Throwaway proving page / a look shown to the human before live UI. | DECIDED |
| **handoff** | A document that carries context to a fresh session or machine. Also: the data edge where one representation converts to another. | DECIDED |
| **backlog** | `shell/BACKLOG.md`, items tagged `[workstream]` or `[shared]`. | DECIDED |
| **orchestrator / builder / reviewer / scout** | The agent roles (`shell/WORKFLOW_HANDOFF.md`). | DECIDED |
| **gate** | The arc's `check:<arc>` command; never advance a milestone while it fails. | DECIDED |
| **lock / owned path / shared path** | A row in `shell/arcs/LOCKS.md` claiming a shared file before editing it. | DECIDED |
| **seam** | A coupling contract between a tool and its host (PitchContext, Preview, Emit). Also "hand-off contract". | DECIDED |
| **look** | A change in appearance only; it goes to the human first, before review or commit. | DECIDED |
| **scenarios first / thin slice first** | Write the human's concrete cases as a table before building; build the thinnest working slice, then stop for a look. | DECIDED |

---

## 3. Pitch, time and structure

### The three 1/1s

Any cycle can be heard against three different references. Naming them
separately is what makes the drone ideas in section 4 work.

| Term | Meaning | Status |
|---|---|---|
| **1/1** | The reference a set of ratios is stated against. | DECIDED |
| **cycle 1/1** (home 1/1) | The 1/1 a cycle has on its own terms: its first slot, the root it was built from. | LEANING |
| **rerooted 1/1** | A note chosen to become the 1/1; every ratio is divided by it (see *re-root*). | DECIDED |
| **virtual fundamental** | The fundamental of the harmonic series a set sits in, whether or not it sounds. The canon's word ("the ring is harmonics L to 2L of a virtual fundamental"). *Imagined fundamental* (human, 2026-11-22) is a synonym; prefer **virtual** in code and docs. | DECIDED |
| **realized fundamental** | A virtual fundamental made audible (e.g. sounded as a drone). | LEANING |

### Rings, cycles and rhythm as pitch

| Term | Meaning | Status |
|---|---|---|
| **cycle / ring** | L equal slots that wrap around; the shared frame for pitch and rhythm. | DECIDED |
| **linear ring / log ring / rates reading** | The three ways to read ratios as rhythm (Canon 1). | DECIDED |
| **L (LCD), tatum** | The common denominator that sets the ring size; the tatum is 1/L of the cycle, the finest grid every onset sits on. | DECIDED |
| **equave** | The interval a set repeats at (octave, or not). | DECIDED |
| **re-root** | Divide every ratio by a new root (and reduce by the equave). On the linear ring this differs from rotation: each mode gets its own LCD and so its own ring (Canon 3). | DECIDED |
| **fingerprint** | The vector of mode ring sizes; a complete invariant (Canon 3). | DECIDED |
| **harmonic ring** | A chord's span read as one harmonic series: notes rounded to the nearest harmonic of a virtual fundamental, ring = harmonics L to top. | DECIDED |
| **harmonic series segment** | Any set heard as a slice of one overtone series (not necessarily neighboring harmonics). | DECIDED |
| **field** | In the Harmonic Field Lab, a generated pitch collection reduced into one equave, sorted by cents. Related: generator, subset, card, shelf, stash, sketch, composite. **Collision:** the human also says "tuning field" for a grid to lock to (12-EDO lock). Prefer **tuning grid** for that sense. | DECIDED / LEANING |
| **span** | The interval from a set's lowest to highest note; the window things are fitted into. | DECIDED |

### Equivalence and relation

| Term | Meaning | Status |
|---|---|---|
| **Z-relation** | Two different sets with the same interval content. Studied at three levels: JI, log ring, linear ring (Canon 6). | DECIDED |
| **Z-partner, Z-family** | A set's Z-related mate; a group of them. Family law: P = U·V with partner U·V′ (one factor mirrored). | DECIDED |
| **Z-twin** | A different rhythm with exactly the same time distances between its attacks (rhythm crystals). | DECIDED |
| **factor law, sporadic, gamut, odd-limit diamond** | Vocabulary of the JI Z-pair search (`research/ji-z-partners/HANDOFF.md`). | DECIDED |

### Placement and Schillinger's units

| Term | Meaning | Source | Status |
|---|---|---|---|
| **placement** | Putting notes into a span so that each placement adds relations to every note already placed. | human | DECIDED |
| **essential / induced intervals** | The intervals you ask for / the ones that appear as a side effect. | human | DECIDED |
| **required / secondary intervals** | Required-interval explorer: what you must have / what is used to complete the fill. | human | DECIDED |
| **neutral tone** (rest tone) | A required note; where a unit comes to rest. | Schillinger | DECIDED |
| **hung tone** (auxiliary) | A note hung off a neutral tone by a secondary interval; it leads into the note it hangs from. | human + Schillinger | DECIDED |
| **directional unit** | A neutral tone with its auxiliaries, played in sequence and ending on the neutral tone (Book II 8 B; Book IX ch. 8). | Schillinger | DECIDED |
| **hung set / shadow** | The hung tones alone, as their own collection. | human | DECIDED |
| **shadow pivot / pivot partner** | Another collection placed so its hung tones land on this one's hung tones; the "inner web". | human | DECIDED |
| **atlas / tile** | Interval Placement's navigable view of results. | — | DECIDED |

### Crystals, fitting and nesting

| Term | Meaning | Source | Status |
|---|---|---|---|
| **crystal chord** | Root + i·g1 + j·g2 + k·g3. | Wallin | DECIDED |
| **rhythm crystal** | A crystal moved into time: a canon on a cycle, each cell entered at every onset of the others, weights = accents. | human + Wallin | DECIDED |
| **germ, cell** | A crystal's generating intervals; one entering rhythm. | Wallin | DECIDED |
| **fit, ring chord, re-ring** | Fitting a chord into a span; a chord read on a ring; doing it again on the result. | human | DECIDED |
| **harmonic nesting** | "at any time I could pull a subset back out and retransform it or re-present it in a new context." | human | DECIDED |
| **derivation graph** | The record of what was derived from what (`PROPOSAL.derivation-graph.md`). | Claude | LEANING |
| **snapshot + recipe** | The pitches as heard (the truth) + how to rebuild them. | Claude | LEANING |
| **sound world (generator)** | Describe an idea or feeling, get a proposed generator plus 3–5 subsets (backlog). | Claude | OPEN |

### Overloaded words — always qualify these

| Word | Senses | Say instead |
|---|---|---|
| **canon** | (1) the settled-facts document; (2) the musical canon (rhythm crystals are canons on a cycle) | "the canon" (doc) vs "a canon" / "canon on a cycle" (music) |
| **pivot** | (1) pivot partial, metric modulation through a shared partial; (2) pivot partner, shared hung tones; (3) pivot note, held still in the retuner | always use the two-word form |
| **realization** | (1) Workbench: the step that gives material musical time; (2) lattice: a choice of three primes on the box edges | "realize in time" vs "lattice realization" |
| **snapshot** | (1) derivation graph; (2) Edel undo state; (3) a canon is a snapshot | qualify by owner |
| **field** | lab field vs tuning grid | see *field* above |

---

## 4. The Hindustani bridge (OPEN, from 2026-11-22)

Borrowed terms and their quasi- counterparts in this project. Exploration, not
decisions: the aim is drone and raga thinking joined to the spectral → rhythm
work, without looping beds and composed phrases.

| Hindustani term | Meaning there | Counterpart here | Status |
|---|---|---|---|
| **Sa / drone** | The fixed tonic every note is heard against. | One of the three 1/1s made audible; proposed: the **realized fundamental**, which moves as the active notes change. | OPEN |
| **nyas** | Notes a phrase may rest on. | **Neutral tones**; the **cycle 1/1** of the current unit. | LEANING |
| **vadi / samvadi** | The two most important notes, often a 4th or 5th apart. | A **required interval** as the structural axis. | LEANING |
| **chalan** | The grammar of movement: how notes are approached, where you rest. | The placement rules + hanging directions = an **ur-chalan**. | LEANING |
| **pakad** | One characteristic catch-phrase drawn from the chalan. | One collection played as **directional units** = an **ur-pakad** candidate. | LEANING |
| **aroha / avaroha, vakra** | Different ascending and descending paths; zigzag motion. | The **direction** filter (hung upward or downward). | LEANING |
| **alpatva / bahutva** | Weak vs strong notes. | **Hung set** vs neutral tones. | LEANING |
| **alap** | Unfolding the raga note by note. | Revealing the field note by note, each addition possibly moving the virtual fundamental, so the reveal order is the harmonic progression. | OPEN |
| **taraf** (sympathetic strings) | Strings that sound only when the melody touches their pitch. | A bed of resonators tuned to the current series, excited by the melody, instead of a loop. | OPEN |
| **sam / avartan / tala** | The downbeat where the cycle closes; the full cycle; the meter. | **sam** = the coincidence point of partial ratios slowed into pulse streams, i.e. the 1/1 in time; **avartan** = their common cycle. A **macro-rhythm** of the chord. | OPEN |
| **swaroop / lakshana** | A raga's whole identity; its defining marks. | What a collection + its ur-chalan + its drone add up to. | OPEN |
| **quasi-raga** | — | A piece built this way: raga's shape by deliberate analogy, without octave equivalence or a single Sa. | OPEN |

Known differences (why it's quasi-, not raga): these collections are exact
steps and don't repeat at the octave; a structure can have several equal
neutral tones instead of one Sa; and a raga is purely sequential, where these
structures are also heard as chords.

---

## 5. Instruments and the Workbench (brief)

Mostly coined by Claude in design conversations; see the linked docs for full
definitions.

| Term | Meaning | Where |
|---|---|---|
| **Workbench** | The composition workbench in `shell/`. | `_Ideas/Workbench-UI-Musings.md` |
| **Stage, Region, Module, Slot, Layout, Size** | The original layout vocabulary ("size", not "shape"). | `shell/arcs/stage/ARC.md` |
| **dock Stage: Docker, Panel, Split, Screenset, Place** | The one-stage docking layout; a screenset is a named, saved arrangement per project. | `shell/arcs/workbench/DESIGN.one-stage.md` |
| **packet, desk, clip, lineage** | Data moving between tools; the desk holds clips the composer chose to keep; where each came from. | `shell/ARCHITECTURE.md` |
| **instruments / processors / operations** | Direct tools / modules on the canvas / one-time actions. | `shell/arcs/workbench/ARC.md` |
| **aspect, reroll / lock / bake / lift** | Workbench design concepts (Claude). | `_Ideas/Workbench-UI-Musings.md` |

---

## 6. The Hrifa universe

| Term | Meaning | Where | Status |
|---|---|---|---|
| **Hrifa** | "a collection of visual instruments and experiments." | `Design Philosophy.md` | DECIDED |
| **Hrifa universe** | The whole creative world: the instruments, the musical systems, the world map. | human | DECIDED |
| **world map / tiles** | Where glyphs are placed. | `a-stone-throw/stone-throw-handoff.md` | DECIDED |
| **glyph** | A hand-drawn mark loosely derived from where real dropped objects came to rest on a grid. Its in-world meaning (inscription, ward, place-marker…) is still open. | same | OPEN |
| **Hrifa material** | A fictional material, entered as a custom density/restitution/friction. | same | OPEN |
| **sonic strata** | Three or more sound layers per glyph from the same drop event: **a percussive texture, a drone, and a melodic or harmonic fragment**. The drone is already a Hrifa stratum, which links this to section 4. | same | OPEN |
| **relic, Anchor Frame, edge language** | Hrifa Edel ("Relic Constructor") vocabulary; views: Construction, Skeleton, Membrane, Graph. | `hrifa-edel/README.md` | DECIDED |
| **lattice as instrument** | "the lattice is the thing that makes the pitches, and something (a molecule…) is projected onto it." | `_Ideas/Lattice-As-Instrument.md` | OPEN |
| **inversive circle** | "basically defines a new universe for everything else to live within" (human, 2026-08). | past session | OPEN |
| **nuclear systems** | The core systems of the Hrifa universe. **Not written down anywhere yet**; no doc or commit defines them. To be filled in by the human. | human, 2026-11-22 | OPEN |
| **early Ideas** | The early sketches of the Hrifa world the human plans to return to. Location not yet identified in the repo. | human, 2026-11-22 | OPEN |

---

## Change log

- 2026-11-22: created. Prefix grammar proposed (meta / macro-micro / ur /
  quasi / proto; retire pseudo). Proposed renames: meta-grid → macro-grid,
  meta-tab → screenset tab, tuning field → tuning grid. Hindustani bridge
  added as OPEN.
