# Repo layout note: two coexisting systems

This repo currently contains two unrelated frontend systems. Don't mix their
conventions.

## Legacy: portal + applets (everything except `shell/`)

Standalone vanilla-JS/HTML applets (`color-checker/`, `hrifa-edel/`, etc.),
catalogued in `applets.js` and styled via the shared `design-tokens/` package
(Style Dictionary → `hrifa.css`). Governed by `APPLET_CONVENTIONS.md` and
`Design Philosophy.md` — read those before touching anything here. This
system is not being deleted; it keeps working as-is until an applet is
deliberately ported.

## New: `shell/`

A separate React + Vite + Mantine app, scaffolded verbatim from
`mantinedev/vite-template` (TypeScript, Yarn Berry — run via
`corepack yarn` from inside `shell/`). Uses Mantine's components and
color-scheme handling, with one deliberately owned theme in `shell/src/theme/`
(neutral ramps, one accent, a categorical color set, per-scheme marks and
tints) documented in `shell/src/theme/THEMING.md` — read it before touching
colors, and use its roles (`--panel`, `--text-muted`, `--mark-<hue>`) instead
of palette shades or hex values. Do not re-theme it to match
`design-tokens`/`Design Philosophy.md`, and do not pull the old CSS custom
properties into it. This is the foundation new features are being built on;
existing applets will be ported into it individually over time, not all at
once.

Work in `shell/` is organised as several concurrent arcs: read `shell/CLAUDE.md`
(workflow rules), `shell/ARCHITECTURE.md` (shared map), `shell/DECISIONS.md`
(cross-project decisions) and `shell/arcs/` (one folder per arc) before starting.

When working in `shell/`, ignore `Design Philosophy.md` and
`APPLET_CONVENTIONS.md` — they describe the legacy system only.
