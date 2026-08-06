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
