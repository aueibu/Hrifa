# Hrifa Design Philosophy

**Status:** Evergreen living guide
**Applies to:** the Hrifa portal and its applets, beginning with Hrifa Edel

## Purpose

Hrifa is a collection of visual instruments and experiments. Its design should make exploration feel intentional: curious and tactile, but never visually noisy or hard to operate.

The portal establishes the shared voice. Each applet may have its own domain-specific structure, but should feel recognizably part of the same family.

## Core principles

1. **Make the work the visual event.** Geometry, outputs, and state deserve attention before interface decoration.
2. **Use a quiet instrument panel.** Controls must be compact, legible, and predictably placed.
3. **Let structure show.** Rules, outlines, alignment, and deliberate spacing should reveal hierarchy rather than conceal it in floating cards.
4. **Use accents as information.** Colour and unusual marks should signal selection, preview, relationship, or exception—not merely add decoration.
5. **Be experimental, not chaotic.** Abstract forms may suggest an applet's idea, but they must not interfere with use.
6. **Preserve local character.** A shared system should not flatten every applet into the same layout or interaction model.

## Visual language

### Surfaces and lines

- Default surface: warm paper, not pure white.
- Primary ink: near-black, softened enough to feel printed rather than clinical.
- Use a restrained carbon-tinted paper surface for fixed instrument panels (currently `#F1EDE9` in Edel). Keep canvases, editable fields, readout boxes, and other work surfaces on un-tinted Paper `#F9F5F0` so the active material remains visually clear.
- Build major sections with thin rules, square or nearly square edges, and intentional alignment.
- Prefer one clear container relationship over several nested decorative cards.
- Hover and focus states should make the current action obvious, with modest movement only where it helps perception.
- Select/dropdown fields use an **inset accent hover state**: keep the surface unchanged, change the 1 px field border to the chrome accent, and add a 3 px chrome-accent inset bar on the left edge. This indicates editability without turning the field into a filled control. On keyboard focus, retain that treatment and add the standard 3 px chrome-accent focus outline with a 2 px offset.

### Colour

#### Palette

Palette values live in code as CSS custom properties, layered per the [Design tokens](#design-tokens) system below; this table is the source of truth for what each role means and which hue fills it in each theme. Both themes share the same nine primitives (seven accents, one cool "chrome" blue, and a neutral gray family) — only surface/text roles invert between them.

| Role | Domain | Property | Light | Dark | Intended use |
| --- | --- | --- | --- | --- | --- |
| Surface | Shared | `--surface-bg` | Paper `#F9F5F0` | `#181816` | Default page/canvas background. |
| Surface, raised | Shared | `--surface-raised` | `#EDE8E1` | `#262421` | Panels and instrument chrome. |
| Surface, overlay | Shared | `--surface-overlay` | `#E2DBD1` | `#433D37` | Modals, dropdowns, popovers. |
| Border | Shared | `--border` | `#CBC0B2` | `#5F564E` | Default rules and dividers. |
| Border, strong | Shared | `--border-strong` | `#BFB3A3` | `#6E6359` | Emphasized rules, active containers. |
| Text | Shared | `--text` | `#181816` | Paper `#F9F5F0` | Default ink. |
| Text, muted | Shared | `--text-muted` | `#A89984` | `#7C6F64` | Secondary or supporting text. |
| Text, disabled | Shared | `--text-disabled` | Grey Olive `#9D9B97` | Charcoal Brown `#41413E` | Disabled labels and values. |
| Chrome accent | Chrome | `--chrome-accent` | Blue-new `#6C8EB0` | Blue-new `#6C8EB0` | Buttons, sliders, links, focus rings, dropdown hover/inset accent. |
| Chrome accent, soft | Chrome | `--chrome-accent-soft` | derived | derived | Hover fill behind ghost buttons and menu items. |
| Work-surface idle | Work surface | `--point-idle` | Green `#B8BB26` | Green `#B8BB26` | Available but unselected points, edges, or objects. |
| Work-surface hover | Work surface | `--point-hover` | Blue `#83A598` | Blue `#83A598` | Hovered point/edge/object, prior to selection — deliberately a different hue from the chrome accent, per the domain rule below. |
| Work-surface active | Work surface | `--point-active` | Purple `#D3869B` | Purple `#D3869B` | Selected, current, or provisional/preview geometry. Preview is distinguished from committed selection by a ghost/dashed treatment, not a separate hue. |
| Work-surface relation | Work surface | `--point-relation` | Orange `#FE8019` | Orange `#FE8019` | A second object referenced against the active one — comparison, not selection. |
| Emphasis | Shared, rare | `--emphasis` | Yellow `#FABD2F` | Yellow `#FABD2F` | Rare warm or editorial highlight. Never the default selection colour. |
| Critical | Shared | `--critical` | Oxblood *(derived, ~`#8A281D`)* | Oxblood *(derived, ~`#8A281D`)* | Destructive, critical, or irreversible action — deliberately deeper than the base red so it reads as serious, not merely alerting. |

Aqua and the lighter/darker steps of the gray family are reserved: primitives that exist in the palette but have no assigned role yet. Introduce a role for one of them before reaching for a tenth hue — this is the complete accent set; do not expand it casually.

Do not use every accent in every view. Most screens should be surface, text, and border first, with colour reserved for meaningful state.

### Shapes and marks

- Use small, abstract geometric marks as an applet's identity cue—not as literal icons for every control.
- Marks can allude to the applet's subject: a skew, overlap, orbit, point, boundary, fold, or path.
- Dots indicate a focal point, node, datum, or relationship. They should have a reason to exist.
- Keep these marks sparse, graphic, and subordinate to real work on the canvas or page.

## Typography system

Four families are acceptable because their roles are distinct. Do not substitute one font for another merely for variety.

| Role | Preferred family | Use |
| --- | --- | --- |
| Expressive/display | Fraunces | Applet titles, large section titles, selected-object names, and rare high-emphasis moments. |
| Operational UI | Figtree *(Inter as fallback)* | Buttons, labels, instructions, paragraphs, forms, and dense routine interface text. Choose one as the applet's default sans. |
| Instrument/data | DM Mono *(Consolas as fallback)* | Coordinates, values, operation history, identifiers, tags, counts, and aligned technical data. |
| Reading mode | Crimson Text *(Georgia as fallback)* | Longer notes, lore, explanations, and focused descriptive passages only. |

### Typography rules

- Fraunces is the visual voice, not the default body font.
- Figtree is the warm default sans.
- DM Mono should denote data or a system-like record. Avoid setting normal body copy in it.
- Crimson Text is deliberately exceptional. Do not use it for controls, labels, or ordinary panel copy.
- Establish hierarchy through size, spacing, case, and weight. There is not ever a good reason to add another font or colour.

## Interaction and state

- Controls should communicate whether they are resting, available, active, disabled, selected, or previewing.
- Preview states must be visibly distinct from committed work. In canvas areas, use its ghost/dashed treatment; retain the anchor/reference cue where applicable.
- Destructive or irreversible actions deserve a clear warning treatment; do not make them visually identical to ordinary actions.
- Keyboard shortcuts, identifiers, coordinates, and operation history belong to the instrument/data layer.
- Accessibility is part of the aesthetic: visible focus, readable contrast, clear labels, and text that does not rely only on colour.

## Design tokens

Every applet exposes colour and state through named custom properties, layered so a hue can be retuned without touching every place it's used, and so intent is legible in the code itself rather than only in a hex value.

### Two domains, never shared by name

Split tokens into **chrome** (the app's operating controls — buttons, sliders, dropdowns, inputs, focus rings) and **work surface** (the applet's actual subject matter — canvas points, edges, polygons, cells, whatever the user is directly manipulating). A token from one domain must never be read by the other, even when their current values happen to match. This keeps the two vocabularies free to diverge later, and it means a reader can tell from the property name alone whether a colour describes the tool or the thing being worked on.

Buttons, sliders, clickables use a chrome token. 
Selected/provisional, anchor/reference, relation/comparison are work-surface tokens. 

When an applet's canvas needs a hover cue, it should not reach for the chrome accent — introduce or reuse a work-surface hover token instead, even if the two colours end up visually similar.

### A consistent state vocabulary

Name states, not colours. Every interactive element — chrome or work-surface — should be describable with the vocabulary already established above: **resting/idle**, **available** (present but not the focus), **hover**, **active/selected**, **preview/provisional**, **disabled**. Each applet chooses which hues fill those roles from its palette, but the state names stay constant across the whole Hrifa family so a convention learned in one applet transfers to the next.

### Three layers, so the token count stays small

1. **Primitives** — the raw hues from the palette table, one custom property per hue, defined once per theme. Nothing outside the token definitions should reference these directly.
2. **Derived** — soft/muted or dark/deep variants computed from primitives at use-time (e.g. via `color-mix()`) rather than hand-authored as separate literals. This keeps the token count from scaling linearly as new accents or variants get added.
3. **Semantic** — the only layer components and canvas-drawing code should reference: names like `--chrome-accent`, `--point-hover`, `--point-active`, `--point-idle`, `--surface-bg`, `--text-muted`, built from the chrome/work-surface split above. Where canvas code reads computed styles into a JS object (as Edel's `uiTheme` does), that object's keys should carry the same semantic names, not the primitive hue names — so `uiTheme.pointHover` stays legible independent of which hue currently backs it.

## Applying the system to Hrifa Edel

Suggested hierarchy:

1. Canvas and selected geometry: primary visual event.
2. Fraunces app title and major section headings: editorial voice.
3. Figtree or Inter panels and controls: operational clarity.
4. DM Mono coordinates, transform history, feature IDs, and values: instrument voice.
5. Crimson Text only in an intentional notes or explanation area, if one is added.

## Keeping this guide evergreen

Update this document when a design decision becomes a reusable convention, when an existing rule proves wrong in real use, or when an applet introduces a justified extension. Keep entries concrete: state the intended role, the reason, and where it applies. Avoid recording one-off pixel tweaks or temporary implementation details.

When a new applet needs to depart from this guide, record the departure and why; consistency is valuable, but a better tool is more valuable.
