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
- Build major sections with thin rules, square or nearly square edges, and intentional alignment.
- Prefer one clear container relationship over several nested decorative cards.
- Hover and focus states should make the current action obvious, with modest movement only where it helps perception.

### Colour

#### Paper mode palette

The supplied palette is the exact source of truth for paper mode. Its two foundations are **Paper `#F9F5F0`** and **Carbon `#20201F`**: use paper for the resting surface and carbon for default text, outlines, and structural rules.

| Token | Hex | Intended role |
| --- | --- | --- |
| Paper | `#F9F5F0` | Default surface and light field. |
| Carbon | `#20201F` | Default text, rules, outlines, and high-contrast controls. |
| Deep blue | `#124E78` | For plain buttons, slider, and clickables. Cool        |
| Plum | `#703D64` | Deep active emphasis, non-destructive states. |
| Green | `#215B3A` | Secondary relation, anchor, or supportive highlight. |
| Gold | `#E4B92D` | Warm emphasis or broad editorial highlight. It is not the default selection colour. |
| Orange | `#C0522E` | Active selection or point emphasis. |
| Oxblood | `#A0140F` | Destructive, critical, or irreversible action. |

This palette is the complete colour system for paper mode; do not introduce additional hues. In Hrifa Edel, plum is the primary selected and provisional/preview state, green is the anchor or reference-point state, and orange is an additional relation or comparison accent.

Do not use every accent in every view. Most paper-mode screens should be paper and carbon first, with colour reserved for meaningful state.

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
| Operational UI | Figtree *or* Inter | Buttons, labels, instructions, paragraphs, forms, and dense routine interface text. Choose one as the applet's default sans. |
| Instrument/data | DM Mono | Coordinates, values, operation history, identifiers, tags, counts, and aligned technical data. |
| Reading mode | Crimson Text | Longer notes, lore, explanations, and focused descriptive passages only. |

### Typography rules

- Fraunces is the visual voice, not the default body font.
- Figtree is the warmer default sans; Inter is the more neutral, precise alternative. Use one consistently within an applet.
- DM Mono should denote data or a system-like record. Avoid setting normal body copy in it.
- Crimson Text is deliberately exceptional. Do not use it for controls, labels, or ordinary panel copy.
- Establish hierarchy through size, spacing, case, and weight before adding another font or colour.

## Interaction and state

- Controls should communicate whether they are resting, available, active, disabled, selected, or previewing.
- Preview states must be visibly distinct from committed work. In Edel, use its ghost/dashed treatment plus plum; retain the green anchor/reference cue where applicable.
- Destructive or irreversible actions deserve a clear warning treatment; do not make them visually identical to ordinary actions.
- Keyboard shortcuts, identifiers, coordinates, and operation history belong to the instrument/data layer.
- Accessibility is part of the aesthetic: visible focus, readable contrast, clear labels, and text that does not rely only on colour.

## Applying the system to Hrifa Edel

Retheming Edel means adapting its chrome, panels, controls, readouts, and preview states to this language while preserving its geometric workspace and operational clarity. It does **not** mean forcing it into the portal's card grid.

Suggested hierarchy:

1. Canvas and selected geometry: primary visual event.
2. Fraunces app title and major section headings: editorial voice.
3. Figtree or Inter panels and controls: operational clarity.
4. DM Mono coordinates, transform history, feature IDs, and values: instrument voice.
5. Crimson Text only in an intentional notes or explanation area, if one is added.

## Keeping this guide evergreen

Update this document when a design decision becomes a reusable convention, when an existing rule proves wrong in real use, or when an applet introduces a justified extension. Keep entries concrete: state the intended role, the reason, and where it applies. Avoid recording one-off pixel tweaks or temporary implementation details.

When a new applet needs to depart from this guide, record the departure and why; consistency is valuable, but a better tool is more valuable.
