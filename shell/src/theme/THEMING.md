# Shell theming

`src/theme/` is the only place that owns global visual decisions.

## Layers

1. `tokens.ts` holds the values the application deliberately owns: two neutral ramps (`gray` for
   light, `dark` for dark), the primary ramp, the marker hues and the marker ramp. Omitted Mantine
   values use Mantine defaults (`foundation.ts`).
2. `semantic.ts` maps application roles such as `--panel` and `--text-muted` to steps in those ramps
   and emits the per-scheme color variables (`--mark-*`, `--tint-*`). Applets use roles, never
   palette positions.
3. Shared primitives such as `Surface` consume those roles. Pages select a primitive and a semantic
   tone instead of adding panel styles themselves.

## Neutral roles

One warm neutral family, lightest to darkest in each ramp. Mantine's stock role mapping is kept
except in the three places `semantic.ts` overrides it (the page is its own tier; generic borders are
subtler than control outlines; light-mode hover is `gray-1`).

| Role | Light | Dark |
| --- | --- | --- |
| Page (`--surface`) | `gray-0` | `dark-8` |
| Panel (`--panel`, Mantine body) | `white` | `dark-7` |
| Raised (`--panel-raised`) | `white` | `dark-6` |
| Inset (`--panel-inset`) | `gray-1` | `dark-9` |
| Hover | `gray-1` | `dark-5` |
| Border (`--border`) | `gray-2` | `dark-5` |
| Control border (`--control-border`, inputs) | `gray-4` | `dark-4` |
| Subtle text / placeholder (`--text-subtle`) | `gray-5` | `dark-3` |
| Muted text (`--text-muted`) | `gray-6` | `dark-2` |
| Text (`--text`) | `black` | `dark-0` |

The dark ramp is a barely-warm gray with wide steps (levels sampled from Bitwig's dark UI, which is
neutral; the warmth is a deliberate small red-to-blue lean) so saturated marks read cleanly on it.
The light ramp is warmer.

## Studio tiers

Dense editors (the composition workbench) need more surface tiers than page/panel/inset. These roles
sit alongside the ones above; light mode gets the nearest equivalents.

| Role | Use | Dark | Bitwig source |
| --- | --- | --- | --- |
| `--panel-well` | deepest recess: browsers, plots, minimap | `dark-9` `#1d1b19` | browser |
| `--surface` | page, gaps and splitters | `dark-8` `#2a2826` | separator |
| `--panel` | sidebars, inspector | `dark-7` `#32302e` | inspector |
| `--panel-slot` | empty cells, fields, inset groups | `dark-6` `#3a3836` | clip slot |
| `--panel-body` | work area: canvas, lanes, device body | `dark-5` `#464442` | lane |
| `--panel-header` | device and panel headers | `dark-5` + 8% `dark-4` | detail header |
| `--grid` | gridlines, cell and panel edges | `dark-5` + 28% `dark-4` | grid |
| `--chrome` | title bars, raised controls | `dark-5` + 38% `dark-4` | track header |

Use `--grid`, not `--border`, for lines drawn on `--panel-body`: `--border` has the same value as the
body in dark mode.

Targets, enforced by `palette.test.ts`: main text 7:1 or more on the panel; muted and subtle text
4.5:1 or more, and main text visibly stronger than muted (1.5:1 between them); control borders 3:1
or more on the panel; the panel separable from the page; each ramp in strict lightness order.

## One accent, many categories

Apps that use several colors to mean different things draw from four separate roles:

- **Accent**: the primary color (the blue ramp). Focus, selection, links, primary actions. It never
  encodes data.
- **Status**: success, warning, danger and info are green, yellow, red and blue tints, always with an
  icon and a word, never color alone.
- **Categories**: eight core hues (red, orange, yellow, green, cyan, blue, violet, pink) spaced at
  least 40 degrees apart. Lime, teal, indigo and grape remain so Mantine components that name them
  keep working, but they sit at the 25-degree minimum from their neighbours; do not place them beside
  those neighbours. Address a category by hue name through `--mark-<hue>` or `markHue`.
- **Tints**: `--tint-<hue>-bg`, `-bg-hover` and `-text`: a faint fill with hue-colored text at 7:1 or
  more, for chips and badges that say what kind of thing something is. Mantine's "light" variants use
  the same values.

`--mark-<hue>` is the hue as a mark (line, dot, text) on a panel. Its lightness is set per scheme
(`markLightness` in `markers.ts`): about 72% in dark and 52% in light, staggered between neighbouring
hues, so every hue holds 3:1 or more against the panel and neighbours stay apart for viewers who
cannot separate red from green. Filled controls use the shared ramp step 6 in both schemes, where
white text holds 4.5:1 or more on every hue.

Hue alone is not enough for two marks that appear together. Where a view shows red beside orange,
yellow beside green, or blue beside violet, add a second channel: a dash pattern, a shape or a
label. The palette test lists the tightest pairs under deuteranopia and protanopia.

## Structure and state rules

Roles say what color a surface is. These rules say how surfaces are arranged and how controls show
their state, so dense editors stay readable as they grow. They apply in both color schemes. The
approach follows cirrhoz's "Bitwig Studio Refurbished" (consistency, complexity, contrast, clarity),
adapted to our roles and accessibility targets.

Status: the rules below are the standard going forward. `--panel-screen`, the state primitives and
the stylelint rule are not built yet; until they are, follow the rule by hand and do not invent a
local substitute.

### 1. Separate by tier, not by line (divider budget)

Every nested envelope and divider adds visual noise. Between two adjacent regions:

- Separate them with a tier step first (`--panel` beside `--panel-body`, `--surface` gaps).
- Use a line (`--grid`, or `--border` on a non-body surface) only when the tiers cannot separate them,
  for example two regions that share a tier.
- Never more than one line between two regions. A region's own outline plus a header underline plus a
  column rule plus a footer rule is a violation: keep the outline, or the internal rules, not both.
- Do not wrap a module in another bordered module. Sub-groups use a tier fill (`--panel-slot`) or
  spacing, not a box.

### 2. Screens and controls are different objects

A **screen** displays data: numeric readouts, curves, piano rolls, duration strips, plots, minimaps,
catalog browsers. A **control** changes something: buttons, switches, fields, sliders, knobs.

- All screens share one role, `--panel-screen` (to be added; dark maps to `--panel-well`). Do not give
  each display its own background.
- Controls sit on the control tiers (`--panel-slot`, `--chrome`) and never on the screen role.
- A screen always reads as the deepest or highest-contrast surface in its device, because it is the
  thing being looked at.

### 3. State grammar

Four control classes, each with exactly one active-state treatment. Shared primitives implement them;
pages do not restyle them.

| Class | Meaning | Active state |
| --- | --- | --- |
| Tab | One of several, mutually exclusive | Filled `--panel-body`-tier surface plus `--text`; inactive tabs are `--text-muted` |
| Switch | Independent on/off that affects the material or sound | Accent fill (`--accent`) |
| View toggle | Independent on/off that changes only the interface (show grid, follow playhead, collapse) | No fill; the icon or label changes to `--accent` |
| Action | Does something once (Play, Reset, Tidy) | Pressed state only; no persistent active look |

Selection and focus keep using the accent. Accent never encodes data (see above). Where a bar is a
different kind of surface, for example the status bar, it may collapse these distinctions, but say so
in a comment.

### 4. No decorative shadows

Dense layouts use tier fills and the `--grid` role for edges. Inner and drop shadows are not used on
panels, devices, cards or controls. Allowed: the elevation of floating surfaces (menus, popovers,
modals), and focus rings. A scroll edge is shown by clipping content, not by a fade or inset shadow.

### 5. Names and values read differently

In a parameter list or readout, the name is `--text-muted` and the value is `--text`. Module and
device titles are `--text`, not muted. Do not use accent or a category hue to tell names from values.

### 6. One icon family

Icons come from the library Mantine already uses, at one size per context and the library's default
stroke width. A custom SVG matches that weight and grid before it ships. Never mix filled and outline
icons in one cluster.

### Where controls may lose their outline

Control borders stay at 3:1 or more on the panel (see the targets above). A control may drop its
border only when its fill already separates it from the panel at 3:1 or more, which in practice means
filled tier controls. Text-only and icon-only buttons on a bare panel keep a visible hover and focus
state and need no border at rest.

### Review checklist

Before a theme or page change is considered done, check in both schemes:

1. Count the lines between any two adjacent regions; it should be one or none.
2. Every data display uses the screen role.
3. Every toggle fits one of the four state classes.
4. No new `box-shadow` outside floating surfaces.
5. Names and values are distinguished by text role only.

## Port rules

- Do not add hex values, raw neutral shades, arbitrary `radius`, `shadow`, `withBorder`, `styles`, or
  `classNames` to page-level Mantine components.
- Never read a fixed palette shade (`--mantine-color-blue-6`) for a mark: it is identical in light
  and dark. Use `--mark-<hue>` or a tint.
- Add a global component default only when it is genuinely universal.
- Add a shared primitive for reusable visual structure; do not turn `Card` into a universal panel
  abstraction.
- Review every theme edit in the Theme Gallery in both color schemes before using it in a port.
- A tokens object saved by the Theme Editor (`shell.theme-tokens.v1` in localStorage) overrides these
  defaults; reset it on the Theme Editor page after the baseline changes.

## Canvas diagrams

`diagram.ts` owns the shared visual contract for canvas-based tools. An applet engine emits semantic
geometry such as a primary mark, construction guide, marker, or annotation; it does not choose
colors, opacity, dash patterns, strokes, or fonts. The page supplies `resolveDiagramStyle()` to its
engine so the active shell theme remains the single rendering authority.

Tools with their own vocabulary add a dedicated resolver next to `resolveDiagramStyle` rather than
overloading it, and reuse the shared contract for anything it already decides. The Radial Growth
Tree's `resolveGrowthTreeStyle()` embeds `resolveDiagramStyle()` as `base` and draws its grid lines,
dashed guides, hover rings, and point radii from it; it adds only genuinely new roles: the O/P/Q
construction circles, tree/dead-end/branch marks, a neutral for field points, and a few ultra-faint
fills (halo, search cones) with no base analog. `resolveSolidViewStyle()` covers the 3D solid roles
(per-origin-type colors, wireframe, axis, grid).

Categorical canvas hues route through `markHue`, which reads `--mark-<hue>`. These are hex strings,
so canvas 2D, SVG and Three.js all parse them directly. Neutral roles (`dimmed`,
`default-border`, `text`) adapt per scheme and are read directly. Engines re-resolve on scheme change
via their `restyle()` hook.
