# Affine Focus Transform Explorer
## Codex Implementation Specification

## 1. Objective

Build a standalone interactive applet for exploring Affine Focus Transform relationships generated from an input pitch-class set.

The app should allow the user to:

- enter a finite set of integers modulo \(m\);
- choose a multiplier \(a\);
- generate focus-based affine transforms;
- inspect the immediate transform family;
- compute the finite closure of repeated transforms;
- explore the resulting directed graph;
- inspect every node and transformation arithmetically;
- compare closure growth by generation;
- inspect structural statistics;
- explore dual-focus affine maps in a separate mode;
- audition sets and transformations through MIDI;
- export useful graph and set data.

The primary object of the interface is the finite directed transform graph, not merely the transformed set.

Do not implement:

- a composite workflow or transform-chain editor;
- integration with the broader Composition Toolbox architecture;
- shared `CompositeStore`, `AtomicNode`, or transform-log infrastructure.

---

## 2. Recommended Stack

Implement as a client-side web application.

Preferred stack:

- React
- TypeScript
- Vite
- Zustand or equivalent lightweight state store
- React Flow for graph visualization
- Web Audio API or Tone.js for playback
- Vitest for unit tests
- Playwright for high-value interaction tests
- optional VexFlow for staff notation

The app must run locally with:

```bash
npm install
npm run dev
```

A production build must work with:

```bash
npm run build
npm run preview
```

No backend is required. The completed app must run in a modern web browser. The production build should emit static client-side assets that can be served by any ordinary static web server.

---

## 3. Mathematical Model

### 3.1 Pitch-Class Universe

For modulus \(m\), the pitch-class universe is:

\[
\mathbb{Z}_m=\{0,1,\dots,m-1\}
\]

All values must be normalized with:

\[
\operatorname{mod}(x,m)=((x \bmod m)+m)\bmod m
\]

Never rely on JavaScript’s `%` operator alone for negative values.

```ts
function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
```

### 3.2 Affine Focus Transform

Given:

- pitch class \(p\),
- focus \(f\),
- multiplier \(a\),
- modulus \(m\),

compute:

\[
T_{f,a}(p)=f+a(p-f)\pmod m
\]

Equivalently:

\[
T_{f,a}(p)=ap+(1-a)f\pmod m
\]

For a set:

\[
S=\{p_1,p_2,\dots,p_n\}
\]

the transformed set is:

\[
T_{f,a}(S)
=
\{
T_{f,a}(p)
\mid
p\in S
\}
\]

The result must be:

- normalized modulo \(m\);
- deduplicated;
- sorted ascending for canonical identity.

```ts
function transformSet(
  source: readonly number[],
  focus: number,
  multiplier: number,
  modulus: number
): number[] {
  return [...new Set(
    source.map(p =>
      mod(focus + multiplier * mod(p - focus, modulus), modulus)
    )
  )].sort((x, y) => x - y);
}
```

Canonical properties that must be preserved:

\[
T_{f,a}(f)=f
\]

\[
T_{f,1}(p)=p
\]

\[
T_{f,0}(p)=f
\]

Therefore:

- the focus is always invariant;
- multiplier \(a=1\) is the identity for every focus;
- multiplier \(a=0\) collapses the set to the selected focus.

### 3.3 Focus Domain

By default, the available focuses for a set are the members of that set.

For:

\[
S=\{0,2,4,5\}
\]

generate one transform for each:

\[
f\in\{0,2,4,5\}
\]

Add an advanced focus-domain control with these modes:

```ts
type FocusDomainMode =
  | "members"
  | "all-modulus-values"
  | "custom";
```

Default:

```ts
focusDomainMode = "members";
```

Custom focus values must be parsed, normalized, deduplicated, and sorted.

### 3.4 Set Identity

Two nodes are identical when their canonical sorted pitch-class arrays are identical.

Use a stable key:

```ts
function setKey(values: readonly number[]): string {
  return values.join(",");
}
```

The modulus is part of the graph context and does not need to be repeated in every key if one graph always uses one modulus.

### 3.5 Bijectivity

An affine multiplier is bijective modulo \(m\) when:

\[
\gcd(a,m)=1
\]

```ts
function isBijectiveMultiplier(
  multiplier: number,
  modulus: number
): boolean {
  return gcd(multiplier, modulus) === 1;
}
```

Display multiplier classification:

```ts
type MultiplierClass =
  | "bijective"
  | "degenerate";
```

For degenerate multipliers, set cardinality may collapse.

The interface must not prevent degenerate multipliers. It should display a warning and allow exploration.

---

## 4. Core Domain Types

```ts
export interface TransformContext {
  modulus: number;
  multiplier: number;
  focusDomainMode: FocusDomainMode;
  customFocuses: number[];
}

export interface SetNode {
  id: string;
  values: number[];
  generation: number;
  discoveredOrder: number;
  isSeed: boolean;
  isFixedUnderAnyFocus: boolean;
  metadata: SetAnalysis;
}

export interface TransformEdge {
  id: string;
  source: string;
  target: string;
  focus: number;
  multiplier: number;
  modulus: number;
  isSelfLoop: boolean;
}

export interface ClosureGraph {
  seedId: string;
  nodes: SetNode[];
  edges: TransformEdge[];
  generations: ClosureGeneration[];
  saturated: boolean;
  saturationGeneration: number | null;
}

export interface ClosureGeneration {
  index: number;
  nodeIds: string[];
  newlyDiscoveredNodeIds: string[];
}

export interface TransformStep {
  sourcePitch: number;
  offsetFromFocus: number;
  scaledOffset: number;
  reconstructed: number;
  result: number;
}

export interface SetAnalysis {
  cardinality: number;
  complement: number[];
  intervalClassVector?: number[];
  normalOrder?: number[];
  primeForm?: number[];
  transpositionalSymmetryCount: number;
  inversionalSymmetryCount: number;
}

export interface GraphStatistics {
  nodeCount: number;
  edgeCount: number;
  selfLoopCount: number;
  fixedNodeCount: number;
  stronglyConnectedComponentCount: number;
  largestStronglyConnectedComponentSize: number;
  reachableDepth: number;
  graphDiameter: number | null;
  averageOutDegree: number;
  saturationGeneration: number | null;
}
```

---

## 5. Closure Algorithm

### 5.1 Behavior

Closure means repeatedly applying all permitted focus transforms to every newly discovered set until no unseen set remains.

Use breadth-first search.

The focus domain must be recalculated for each source node when the mode is `"members"`.

This means each node generates transforms using its own set members as focuses.

For `"all-modulus-values"`, every node has \(m\) outgoing transform attempts.

For `"custom"`, every node uses the same normalized custom focus list.

### 5.2 Algorithm

```ts
function computeClosure(
  seed: number[],
  context: TransformContext,
  limits: ClosureLimits
): ClosureGraph;
```

Suggested limits:

```ts
export interface ClosureLimits {
  maxNodes: number;
  maxEdges: number;
  maxGeneration: number;
}
```

Defaults:

```ts
const DEFAULT_LIMITS: ClosureLimits = {
  maxNodes: 5000,
  maxEdges: 50000,
  maxGeneration: 100
};
```

Pseudo-code:

```text
const canonicalSeed = canonicalize(seed, modulus);
const queue = [canonicalSeed];

const nodeByKey = new Map<string, SetNode>();
const edges: TransformEdge[] = [];

register seed at generation 0;

while queue is not empty:
  source = queue.shift()
  focuses = resolveFocusDomain(source, context)

  for each focus:
    target = transformSet(source, focus, multiplier, modulus)
    targetKey = setKey(target)

    if targetKey is unseen:
      register target at source.generation + 1
      queue.push(target)

    create directed edge source -> target labeled by focus

  stop if any safety limit is reached
```

Duplicate edges should be handled carefully.

Two different focus values can potentially produce the same source-target pair. Do not collapse them unless the visualization explicitly groups parallel edges.

Recommended internal behavior:

- preserve one edge per focus operation;
- optionally aggregate parallel edges visually.

Edge identity:

```ts
`${sourceId}|${targetId}|${focus}`
```

### 5.3 Saturation

Closure is saturated when:

- the BFS queue becomes empty;
- no safety limit caused termination.

Store:

```ts
saturated: boolean;
saturationGeneration: number | null;
terminationReason?: "saturated" | "maxNodes" | "maxEdges" | "maxGeneration";
```

The interface must distinguish true saturation from truncated exploration.

---

## 6. Application Layout

Use a responsive desktop-first layout.

```text
┌──────────────────────────────────────────────────────────────┐
│ Header / Global controls                                     │
├───────────────────┬──────────────────────────────────────────┤
│ Seed + Parameters │ Main visualization                       │
│ Family Explorer   │ Graph / Timeline tabs                    │
│                   │                                          │
├───────────────────┼──────────────────────────────────────────┤
│ Current Set       │ Transform Inspector / Set Inspector      │
│ Statistics        │                                          │
└───────────────────┴──────────────────────────────────────────┘
```

Recommended proportions:

```text
Left rail: 300–360 px
Center workspace: flexible
Inspector: 320–400 px
```

For narrower windows, collapse the inspector into a right-side drawer.

---

## 7. Header and Global Controls

The header contains:

- application title;
- Single Focus / Dual Focus mode tabs;
- modulus control;
- multiplier control;
- playback controls;
- export menu;
- reset action.

Suggested structure:

```text
Affine Focus Explorer

[ Single Focus ] [ Dual Focus ]

Modulus [12]
Multiplier [5]
[Play Set] [Stop]
[Export ▾]
[Reset]
```

The selected mode changes the workspace but should preserve independent state for each mode.

---

## 8. Seed Definition Panel

### 8.1 Inputs

Provide three synchronized input methods.

#### Text Input

Accepted forms:

```text
0 2 4 5
0,2,4,5
[0, 2, 4, 5]
```

Optional note-name input for modulus 12:

```text
C D E F
C, D, E, F
```

Support common enharmonic names:

```text
C C# Db D D# Eb E F F# Gb G G# Ab A A# Bb B
```

The accidental preference does not affect internal pitch-class storage.

#### Toggle Grid

For practical moduli, show a clickable pitch-class grid.

For modulus 12:

```text
[0] [1] [2] [3] [4] [5] [6] [7] [8] [9] [10] [11]
```

Selected values remain synchronized with text input.

#### Clock-Face Input

Provide an optional circular pitch-class selector.

Requirements:

- one marker per pitch class;
- selected values visually emphasized;
- clicking toggles membership;
- selected set polygon may be shown;
- focus values may be highlighted during inspection.

The clock-face view is optional for the first implementation but recommended.

### 8.2 Seed Controls

Include:

```text
[Apply Seed]
[Clear]
[Random Set]
Cardinality [4]
```

Random set behavior:

- choose unique values;
- use selected modulus;
- use requested cardinality;
- update the text and grid inputs;
- recompute graph automatically if live recompute is enabled.

### 8.3 Input Validation

Show errors for:

- empty seed;
- non-numeric tokens;
- unsupported note names;
- cardinality larger than modulus;
- modulus below 2;
- invalid custom focus input.

Normalize values outside the modulus rather than rejecting them.

Example:

```text
14 → 2 mod 12
-1 → 11 mod 12
```

Display a non-blocking normalization notice.

---

## 9. Parameter Controls

### 9.1 Modulus

Use:

- numeric input;
- preset dropdown.

Suggested presets:

```text
5
7
8
9
10
12
19
24
31
```

Do not hardcode the system to modulus 12.

Changing modulus must:

- normalize the current set;
- deduplicate it;
- recompute all analysis;
- clear stale selection state;
- recompute the graph.

### 9.2 Multiplier

Use:

- numeric input;
- quick-select buttons for multipliers from \(0\) to \(m-1\);
- optional filter for bijective multipliers only.

Display:

```text
Multiplier 5
Bijective modulo 12
gcd(5,12)=1
```

For degenerate multipliers:

```text
Multiplier 6
Degenerate modulo 12
Set cardinality may collapse
```

### 9.3 Focus Domain

Controls:

```text
Focuses:
(•) Members of each current set
( ) Every value in Zₘ
( ) Custom
```

For custom mode:

```text
Custom focuses: [0 3 7]
```

### 9.4 Recompute Behavior

Default to live recompute with a short debounce.

```ts
debounce = 150;
```

Also provide:

```text
[x] Recompute automatically
```

When disabled, show a prominent:

```text
[Generate]
```

button.

---

## 10. Immediate Family Explorer

This panel shows the one-generation transform family of the currently selected source set.

For each focus, display:

```text
f = 0    →    0 1 8 10
f = 2    →    0 2 4 5
f = 4    →    4 6 8 9
f = 5    →    0 2 4 5
```

Use compact cards or rows.

Each family result should support:

- hover preview;
- select result node;
- audition result;
- focus highlight;
- jump to node in graph;
- show transformation arithmetic.

Recommended card:

```text
┌─────────────────────────┐
│ Focus 4             ▶   │
│ 4 6 8 9                 │
│ fixed: no   cardinality 4│
└─────────────────────────┘
```

If multiple focuses produce the same target, either:

- show separate cards; or
- group them as:

```text
Focuses 1, 7 → 0 3 6 9
```

Internally, preserve distinct transform edges.

---

## 11. Closure Graph Workspace

### 11.1 General Requirements

Use a directed graph.

Nodes represent canonical pitch-class sets.

Edges represent focus transforms.

The graph must support:

- zoom;
- pan;
- fit-to-view;
- center selected node;
- minimap;
- search;
- node selection;
- edge selection;
- layout switching;
- filtering;
- export.

React Flow is suitable.

### 11.2 Node Rendering

Each node should display:

```text
Generation 2
0 1 8 10
|S| = 4
```

Visual states:

- seed;
- selected;
- hovered;
- fixed node;
- member of selected strongly connected component;
- truncated or unresolved nodes if limits are reached.

Do not overload the node with every statistic.

Use badges:

```text
Seed
Fixed
SCC 3
```

### 11.3 Edge Rendering

Each edge label should show:

```text
f=4
```

Hover tooltip:

```text
T₄,₅(p) = 4 + 5(p − 4) mod 12
```

Edge interactions:

- selecting an edge opens Transform Inspector;
- hover highlights source and target;
- parallel edges may curve in opposite directions;
- self-loops must be clearly visible.

### 11.4 Layout Modes

Provide:

```ts
type GraphLayoutMode =
  | "hierarchical"
  | "force"
  | "radial"
  | "strongly-connected";
```

#### Hierarchical

Organize by first-discovery generation.

Best default for closure growth.

#### Force

Useful for viewing cycles and clusters.

#### Radial

Seed at center, later generations outward.

#### Strongly Connected

Group nodes by strongly connected component.

Use Dagre or ELK for hierarchical layouts and a force-layout library for force mode.

Layout computation should be isolated from graph generation.

### 11.5 Graph Color Modes

Provide a dropdown:

```ts
type NodeColorMode =
  | "generation"
  | "cardinality"
  | "scc"
  | "fixed-status"
  | "none";
```

Suggested behavior:

- generation: color by BFS generation;
- cardinality: color by set size;
- SCC: color by component;
- fixed-status: fixed versus non-fixed;
- none: neutral.

Use accessible contrast.

### 11.6 Graph Filters

Include:

```text
Generation range
Cardinality range
Hide self-loops
Only reachable from selected node
Only selected SCC
Only fixed nodes
```

Filtering is visual only and must not mutate the closure graph.

### 11.7 Search

Search must accept:

```text
0 1 8 10
[0,1,8,10]
node ID
generation:3
cardinality:4
```

Selecting a result centers and selects the node.

---

## 12. Closure Timeline View

The main workspace should have tabs:

```text
[ Graph ] [ Timeline ] [ Saturation ]
```

The Timeline view shows first discovery grouped by generation.

Example:

```text
Generation 0
[0 2 4 5]

Generation 1
[0 1 8 10]
[6 8 10 11]
[4 6 8 9]
[3 5 7 8]

Generation 2
...
```

Requirements:

- horizontally scrollable generation columns or vertically stacked sections;
- node cards selectable;
- newly discovered count shown;
- cumulative count shown;
- duplicate transform results not repeated as new nodes;
- allow collapse of generations.

Header example:

```text
Generation 3
New: 7
Cumulative: 19
```

---

## 13. Saturation View

Show closure growth numerically and visually.

Recommended graph:

```text
Generation       New Nodes       Cumulative Nodes
0                1               1
1                4               5
2                7               12
3                3               15
4                0               15
```

Also show a simple bar or line chart.

The final state must explicitly display either:

```text
Closure reached at generation 4
```

or:

```text
Exploration truncated at 5000 nodes
Closure not proven
```

Do not describe a truncated graph as saturated.

---

## 14. Transform Inspector

Selecting an edge opens the transform inspector.

Display:

```text
Source
0 2 4 5

Focus
4

Multiplier
5

Modulus
12

Formula
T₄,₅(p) = 4 + 5(p − 4) mod 12

Result
4 6 8 9
```

### 14.1 Step Table

Show one row per source pitch.

| Source \(p\) | Offset \((p-f)\bmod m\) | Scaled offset \(a(p-f)\bmod m\) | Reconstructed \(f+\text{scaled offset}\) | Result mod \(m\) |
|---:|---:|---:|---:|---:|
| 0 | 8 | 4 | 8 | 8 |
| 2 | 10 | 2 | 6 | 6 |
| 4 | 0 | 0 | 4 | 4 |
| 5 | 1 | 5 | 9 | 9 |

Use the original source order if ordered-input mode is added later. For now use ascending canonical order.

### 14.2 Canonical Focus-Relative Calculation

For each source value, show the authoritative three-stage calculation:

```text
offset from focus:
d = (p - f) mod m

scaled offset:
d' = a × d mod m

reconstructed result:
p' = (f + d') mod m
```

The implementation must use:

\[
T_{f,a}(p)=f+a(p-f)\pmod m
\]

The focus must remain fixed:

\[
T_{f,a}(f)=f
\]

When \(a=1\), every focus transform is the identity:

\[
T_{f,1}(p)=p
\]

Do not implement or display \(ap-f\) as the AFT formula.

### 14.3 Inspector Actions

```text
[Play Source]
[Play Result]
[Alternate]
[Copy Formula]
[Copy Table]
[Select Source Node]
[Select Target Node]
```

Alternate playback should play:

```text
source → target → source → target
```

with configurable pause.

---

## 15. Set Inspector

Selecting a node opens the Set Inspector.

Display:

```text
Set
0 1 8 10

Cardinality
4

Generation
2

Complement
2 3 4 5 6 7 9 11
```

### 15.1 Pitch-Class Analysis

For modulus 12, provide:

- normal order;
- prime form;
- interval-class vector;
- complement;
- transpositional symmetry count;
- inversional symmetry count;
- optional Forte number.

For non-12 moduli:

- omit Forte number;
- generalize normal order where practical;
- provide modular interval distribution rather than a six-entry interval-class vector if necessary.

Do not display misleading 12-tone labels for other moduli.

### 15.2 Transform Behavior

Show:

```text
Outgoing transforms: 4
Distinct targets: 4
Self-loops: 1
Incoming transforms: 6
In selected SCC: yes
```

List focuses producing self-loops.

Example:

```text
Fixed under focus 7
```

A node is fixed under a focus when:

```ts
transformSet(node.values, focus, multiplier, modulus)
```

equals the node’s canonical set.

### 15.3 Clock-Face Preview

Display the selected set on a pitch-class circle.

When an edge is selected:

- source values use one visual style;
- result values use another;
- focus is emphasized;
- optionally draw arrows from each source pitch to its result.

---

## 16. Statistics Panel

Compute and display:

```text
Nodes
Edges
Self-loops
Fixed nodes
Strongly connected components
Largest SCC
Maximum discovery depth
Graph diameter
Average out-degree
Saturation generation
```

Definitions:

### Maximum Discovery Depth

Highest BFS generation assigned to a node.

### Graph Diameter

Maximum finite shortest-path distance among reachable ordered node pairs.

For large graphs, exact diameter may be expensive.

Use:

```ts
type DiameterMode =
  | "exact"
  | "approximate"
  | "unavailable";
```

Recommended policy:

- exact when node count ≤ 500;
- approximate sampling above 500;
- show approximation label.

### Strongly Connected Components

Use Tarjan’s or Kosaraju’s algorithm.

Store component ID on each node.

---

## 17. Dual-Focus Mode

Dual Focus must be a separate top-level workspace.

Do not mix dual-focus controls into the normal closure graph panel.

### 17.1 Inputs

Controls:

```text
Modulus
Focus A
Focus B
Map constraints
```

Allow the user to specify whether each focus is:

```text
Fixed individually
Swapped as a pair
Preserved as an unordered axis
```

Suggested type:

```ts
type DualFocusConstraint =
  | "fix-both"
  | "swap"
  | "preserve-axis";
```

### 17.2 General Affine Map

Use:

\[
T(p)=a p+b\pmod m
\]

Search all:

```text
a ∈ Zₘ
b ∈ Zₘ
```

and test the selected constraints.

Optional filter:

```text
[x] Bijective maps only
```

For bijective maps require:

\[
\gcd(a,m)=1
\]

### 17.3 Constraint Definitions

#### Fix Both

\[
T(f_1)=f_1
\]

and

\[
T(f_2)=f_2
\]

#### Swap

\[
T(f_1)=f_2
\]

and

\[
T(f_2)=f_1
\]

#### Preserve Axis

The unordered image set must equal the original unordered focus set:

\[
\{T(f_1),T(f_2)\}
=
\{f_1,f_2\}
\]

This includes both fixed and swapped solutions.

### 17.4 Dual-Focus Results

Show a table:

| Map | Multiplier | Translation | Bijective | Fixed Points | Cycles |
|---|---:|---:|---|---|---|
| \(5p\) | 5 | 0 | yes | 0, 6 | ... |

Selecting a map opens a detailed map inspector.

### 17.5 Dual-Focus Map Inspector

Display:

```text
T(p)=5p mod 12

Focus A
0 → 0

Focus B
6 → 6

Bijective
yes

Fixed points
0, 3, 6, 9

Cycle structure
(0)
(6)
(1 5)
...
```

Include a full mapping table:

| \(p\) | \(T(p)\) |
|---:|---:|
| 0 | 0 |
| 1 | 5 |
| 2 | 10 |
| ... | ... |

### 17.6 Axis Visualization

Show a pitch-class clock with:

- focus A and B emphasized;
- line or diameter connecting them;
- arrows for the selected affine map;
- fixed points marked;
- swapped focus behavior animated when applicable.

### 17.7 Apply Map to Set

Dual-focus mode should also include an input set.

Allow:

```text
[Apply Selected Map]
```

Display source and result.

This does not create a composite workflow. It is only a one-step map application and comparison.

---

## 18. Playback

Implement simple MIDI-like playback through Tone.js or the Web Audio API.

Controls:

```text
Root MIDI note
Octave/register
Note duration
Velocity
Playback mode
```

Playback modes:

```ts
type PlaybackMode =
  | "simultaneous"
  | "ascending"
  | "descending"
  | "cyclic";
```

Default:

```text
Root MIDI note: 60
Mode: simultaneous
Duration: 500 ms
```

Pitch realization:

```ts
midi = rootMidi + pitchClass;
```

For moduli other than 12, support one of these strategies:

1. map each modulus step proportionally within the octave using frequency ratios;
2. disable MIDI-note assumptions and use direct oscillator frequency.

Preferred general solution:

\[
f(p)
=
f_0 \cdot 2^{p/m}
\]

For repeated or layered sets, choose a stable register.

Provide:

- play seed;
- play selected node;
- play source/result alternation;
- stop;
- optional loop.

---

## 19. Export

Provide an Export menu with:

```text
Graph JSON
Graph CSV
Graph SVG or PNG
Mermaid
Selected Set
Transform Table
Dual-Focus Maps
```

### 19.1 JSON

Include:

```json
{
  "context": {
    "modulus": 12,
    "multiplier": 5,
    "focusDomainMode": "members"
  },
  "seed": [0, 2, 4, 5],
  "nodes": [],
  "edges": [],
  "statistics": {}
}
```

### 19.2 CSV

Nodes CSV:

```text
id,values,generation,cardinality,scc,isSeed,isFixed
```

Edges CSV:

```text
id,source,target,focus,multiplier,modulus,isSelfLoop
```

### 19.3 Mermaid

Export:

```text
graph TD
  A["0 2 4 5"]
  B["0 1 8 10"]
  A -->|f=0| B
```

Escape labels safely.

---

## 20. State Management

Suggested Zustand store:

```ts
interface AppState {
  mode: "single-focus" | "dual-focus";

  seedInput: string;
  seed: number[];

  modulus: number;
  multiplier: number;

  focusDomainMode: FocusDomainMode;
  customFocuses: number[];

  closure: ClosureGraph | null;
  statistics: GraphStatistics | null;

  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  graphLayoutMode: GraphLayoutMode;
  nodeColorMode: NodeColorMode;

  graphFilters: GraphFilters;

  closureLimits: ClosureLimits;
  autoRecompute: boolean;

  dualFocusState: DualFocusState;

  setSeedInput(input: string): void;
  applySeed(): void;
  setModulus(value: number): void;
  setMultiplier(value: number): void;
  computeGraph(): void;
  selectNode(id: string | null): void;
  selectEdge(id: string | null): void;
}
```

Keep mathematical functions outside React components.

Suggested folders:

```text
src/
  app/
    App.tsx
    store.ts

  math/
    mod.ts
    gcd.ts
    canonicalize.ts
    affineFocus.ts
    closure.ts
    graphAnalysis.ts
    pitchClassAnalysis.ts
    dualFocus.ts

  components/
    Header/
    SeedPanel/
    ParameterPanel/
    FamilyExplorer/
    ClosureGraph/
    TimelineView/
    SaturationView/
    TransformInspector/
    SetInspector/
    StatisticsPanel/
    DualFocusWorkspace/
    PitchClassClock/
    PlaybackControls/

  audio/
    playback.ts

  export/
    graphJson.ts
    graphCsv.ts
    mermaid.ts

  workers/
    closureWorker.ts

  tests/
```

---

## 21. Performance

Closure can become large.

Run closure computation in a Web Worker when:

```text
estimated or observed node count > 250
```

At minimum, provide:

- progress callback;
- cancellation;
- safety limits;
- non-blocking interface;
- termination reason.

Suggested progress data:

```ts
interface ClosureProgress {
  generation: number;
  nodesDiscovered: number;
  edgesGenerated: number;
  queueLength: number;
}
```

Show:

```text
Generation 8
Nodes 1,284
Edges 5,136
[Cancel]
```

Do not freeze the UI during closure calculation.

---

## 22. URL and Local Persistence

Persist the current session in local storage.

Store:

- modulus;
- multiplier;
- seed;
- focus mode;
- custom focuses;
- graph layout;
- playback settings;
- dual-focus settings.

Do not persist the full closure graph unless necessary. Recompute from parameters.

Optionally encode a compact configuration into the URL query string:

```text
?m=12&a=5&s=0,2,4,5&focus=members
```

This enables shareable configurations.

---

## 23. Accessibility

Requirements:

- full keyboard navigation for controls;
- visible focus states;
- graph selection must be reflected in text-based inspectors;
- do not rely on color alone;
- use patterns, icons, badges, or labels for graph categories;
- tooltips must also be available through focus;
- all playback controls need accessible names;
- provide a reduced-motion mode;
- support zoom through buttons as well as wheel interaction.

---

## 24. Error and Warning States

Examples:

```text
Seed set is empty.
```

```text
The multiplier is degenerate modulo 12. Some transforms may reduce cardinality.
```

```text
Closure computation stopped at the 5000-node safety limit.
```

```text
No dual-focus affine maps satisfy the selected constraints.
```

```text
The selected modulus is too large for a clock-face display. Using grid display instead.
```

The application should remain usable after all errors.

---

## 25. Testing Requirements

### 25.1 Unit Tests

Test `mod`:

```ts
mod(-1, 12) === 11
mod(13, 12) === 1
```

Test canonicalization:

```ts
canonicalize([4, 1, 4, 13], 12)
// [1, 4]
```

Test the identity property:

```ts
transformSet([0, 1, 4, 6], 1, 1, 12)
// [0, 1, 4, 6]
```

Detailed calculation:

```text
0 → offset 11 → scaled offset 11 → 1 + 11 = 0
1 → offset 0  → scaled offset 0  → 1 + 0  = 1
4 → offset 3  → scaled offset 3  → 1 + 3  = 4
6 → offset 5  → scaled offset 5  → 1 + 5  = 6
```

Test a non-identity bijective transform:

```ts
transformSet([0, 1, 4, 6], 1, 5, 12)
// [1, 2, 4, 8]
```

Detailed calculation:

```text
0 → offset 11 → scaled offset 7 → 1 + 7 = 8
1 → offset 0  → scaled offset 0 → 1 + 0 = 1
4 → offset 3  → scaled offset 3 → 1 + 3 = 4
6 → offset 5  → scaled offset 1 → 1 + 1 = 2
```

Test focus invariance:

```ts
transformSet([1], 1, 0, 12)  // [1]
transformSet([1], 1, 5, 12)  // [1]
transformSet([1], 1, 11, 12) // [1]
```

The authoritative implementation formula is:

\[
T_{f,a}(p)=f+a(p-f)\pmod m
\]

Test bijectivity:

```ts
isBijectiveMultiplier(5, 12) === true
isBijectiveMultiplier(6, 12) === false
```

Test closure:

- no duplicate canonical nodes;
- all edges reference valid nodes;
- saturation is detected correctly;
- generation numbers reflect first discovery;
- self-loops are preserved.

Test SCC analysis using known small graphs.

Test dual-focus constraint search.

### 25.2 Integration Tests

Test:

- entering a seed updates family results;
- changing multiplier recomputes closure;
- selecting a graph edge populates the arithmetic table;
- selecting a node populates set analysis;
- timeline and graph selections stay synchronized;
- truncation is visibly distinguished from saturation;
- dual-focus search returns and inspects valid maps;
- export JSON contains the visible graph context.

---

## 26. Initial Implementation Phases

### Phase 1 — Mathematical Core

Implement:

- modular arithmetic;
- seed parsing;
- transform generation;
- closure BFS;
- node deduplication;
- edge creation;
- unit tests.

### Phase 2 — Basic Interface

Implement:

- seed input;
- modulus;
- multiplier;
- focus domain;
- immediate family explorer;
- basic graph;
- node and edge selection.

### Phase 3 — Inspectors and Analysis

Implement:

- arithmetic transform table;
- set inspector;
- complement;
- interval analysis;
- graph statistics;
- SCC analysis.

### Phase 4 — Alternate Views

Implement:

- timeline;
- saturation graph;
- graph layout modes;
- graph filters;
- search.

### Phase 5 — Dual Focus

Implement:

- affine map search;
- constraints;
- mapping table;
- cycle decomposition;
- axis visualization;
- one-step set application.

### Phase 6 — Playback and Export

Implement:

- audio playback;
- graph JSON;
- CSV;
- Mermaid;
- image export;
- local persistence.

### Phase 7 — Performance and Polish

Implement:

- Web Worker closure calculation;
- cancellation;
- progress;
- large-graph warnings;
- accessibility;
- responsive layout;
- end-to-end tests.

---

## 27. Acceptance Criteria

The implementation is complete when:

1. A user can enter a pitch-class set and modulus.
2. A user can select any integer multiplier.
3. The app correctly classifies the multiplier as bijective or degenerate.
4. The app generates one focus transform per permitted focus.
5. The immediate family is visible and selectable.
6. The app computes repeated closure without duplicate set nodes.
7. The app displays closure as a directed graph.
8. Every edge identifies its focus.
9. Selecting an edge shows the complete arithmetic calculation.
10. Selecting a node shows set-theoretic and pitch-class analysis.
11. The graph can be viewed by generation.
12. Saturation growth is displayed.
13. True saturation is distinguished from a safety-limit termination.
14. Strongly connected components and self-loops are detected.
15. Dual-focus affine maps can be searched and inspected.
16. Selected sets and transformations can be auditioned.
17. Graph and transform data can be exported.
18. The application remains responsive during larger closure computations.
19. Core mathematical functions have automated tests.
20. The app runs entirely client-side without a backend.

