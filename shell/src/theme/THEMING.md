# Shell theming

`src/theme/` is the only place that owns global visual decisions.

## Layers

1. `foundation.ts` contains only Mantine values the application deliberately owns.
   Omitted values use Mantine defaults.
2. `semantic.ts` maps application roles such as `--panel` and `--text-muted` to
   steps in one shared neutral ramp. Applets use roles, never palette positions.
3. Shared primitives such as `Surface` consume those roles. Pages select a
   primitive and a semantic tone instead of adding panel styles themselves.

## Initial tuning budget

Tune the whole neutral ramp as one family in the Theme Gallery. Light and dark
page surface, panel, border, main text, and muted text derive from documented
steps in that ramp; they are not independent color values.

## Port rules

- Do not add hex values, raw neutral shades, arbitrary `radius`, `shadow`,
  `withBorder`, `styles`, or `classNames` to page-level Mantine components.
- Add a global component default only when it is genuinely universal.
- Add a shared primitive for reusable visual structure; do not turn `Card`
  into a universal panel abstraction.
- Review every theme edit in the Theme Gallery in both color schemes before
  using it in a port.

## Canvas diagrams

`diagram.ts` owns the shared visual contract for canvas-based tools. An applet
engine emits semantic geometry such as a primary mark, construction guide,
marker, or annotation; it does not choose colors, opacity, dash patterns,
strokes, or fonts. The page supplies `resolveDiagramStyle()` to its engine so
the active shell theme remains the single rendering authority.

Tools with their own vocabulary add a dedicated resolver next to
`resolveDiagramStyle` rather than overloading it, and reuse the shared contract
for anything it already decides. The Radial Growth Tree's
`resolveGrowthTreeStyle()` embeds `resolveDiagramStyle()` as `base` and draws
its grid lines, dashed guides, hover rings, and point radii from it; it adds
only genuinely new roles — the O/P/Q construction circles, tree/dead-end/branch
marks, a neutral for field points, and a few ultra-faint fills (halo, search
cones) with no base analog. `resolveSolidViewStyle()` covers the 3D solid roles
(per-origin-type colors, wireframe, axis, grid). All roles map to Mantine
palette variables so both schemes resolve automatically. The palette resolves to
`oklch()`, which canvas 2D renders directly; the Three.js view converts each role
color to hex through a probe canvas because THREE.Color cannot parse `oklch()`.

Fixed palette shades (`--mantine-color-*-6`) are identical in light and dark —
only the neutral roles adapt — so categorical canvas hues route through
`markHue`, which reads `data-mantine-color-scheme` and picks a lighter step on
dark / darker step on light to hold contrast against the scheme-adaptive panel.
Neutral roles (`dimmed`, `default-border`, `text`) already adapt and are read
directly. Engines re-resolve on scheme change via their `restyle()` hook.
