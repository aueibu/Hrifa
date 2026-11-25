# Hrifa

All active work happens in `shell/`. Start there.

## Repo layout

| Path | What it is | Status |
| --- | --- | --- |
| `shell/` | React + Vite + Mantine app: the foundation everything new is built on | **Active** |
| `research/` | Python research read by shell arcs (`research/ji-z-partners/`: JI Z-relation search, see its `HANDOFF.md`) | Active |
| `_Ideas/` | Idea notes, handoffs and research write-ups (`Rhythm-As-Pitch/` holds the ratio-rhythm canon) | Active |
| `legacy/` | The old vanilla-JS portal and standalone applets, plus their docs | **Archived** |

## `shell/`

A React + Vite + Mantine app, scaffolded from `mantinedev/vite-template`
(TypeScript, Yarn Berry: run via `corepack yarn` from inside `shell/`). It uses
Mantine's components and color-scheme handling, with one deliberately owned
theme in `shell/src/theme/` (neutral ramps, one accent, a categorical color
set, per-scheme marks and tints) documented in `shell/src/theme/THEMING.md`.
Read that before touching colors, and use its roles (`--panel`, `--text-muted`,
`--mark-<hue>`) instead of palette shades or hex values.

Work in `shell/` is organized as several concurrent arcs. Before starting, read:

1. `shell/CLAUDE.md`: workflow rules, checks, environment notes
2. `shell/ARCHITECTURE.md`: the shared map
3. `shell/DECISIONS.md`: cross-project decisions
4. `shell/UI-RULES.md`: standing UI rules
5. `shell/arcs/`: one folder per arc (`LOCKS.md` says who owns what right now)

## `legacy/` (archived)

The old portal (`legacy/index.html`, `legacy/applets.js`), its standalone
applets (`legacy/color-checker/`, `legacy/hrifa-edel/`, ...), the
`legacy/design-tokens/` package and the old docs (`APPLET_CONVENTIONS.md`,
`Design Philosophy.md`, `SMOKE_TESTS.md`) are parked here for now.

- Don't read, edit or take conventions from `legacy/` unless the user asks for
  something in it. Its docs describe the old system only; don't apply them to
  `shell/`.
- Never re-theme `shell/` to match `legacy/design-tokens` or pull its CSS
  custom properties in.
- An applet leaves `legacy/` only by being ported into `shell/` (the
  `port-applet` skill), one at a time, when the user asks.
- The legacy applets are still published: the Pages deploy copies `legacy/`
  to the site root (so `/Hrifa/color-checker/` keeps working) and layers the
  shell build on top. `shell/src/data/applets.ts` links to them by those
  relative URLs.
