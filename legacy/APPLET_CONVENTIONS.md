# Hrifa applet conventions

This repository is a workbench, not a monolithic product. Applets may remain
small, standalone HTML/CSS/JavaScript tools, or use a local service when that
is genuinely required. Share conventions and data boundaries; do not merge
specialised geometry, rendering, or simulation engines merely for uniformity.

## Catalogue and lifecycle

`applets.js` is the source of truth for every portal-visible applet. Each entry
declares its category, lifecycle status, and runtime requirement.

- **maintained** — supported working tool. Changes should preserve its stated
  workflow and receive syntax plus browser smoke checks.
- **experimental** — active research prototype. It is usable, but its model or
  interaction may still change substantially.
- **infrastructure** — shared support code, such as `design-tokens`; it is not
  a portal applet.
- **archived** — retained reference material, such as `archive/` and `snips/`;
  it must not appear in the portal catalogue.

Empty holding folders (`if-you-could/` and `Snip Collector/`) are not applets
until they contain a documented tool and a catalogue entry.

## Shared browser contract

- Use `design-tokens/build/css/base.css`, `light.css`, and `dark.css` for
  applets adopting the shared theme. Reference semantic token variables, not
  raw palette values.
- Keep browser persistence local and versioned. Use a namespaced storage key;
  provide an import/export or reset path whenever saved state is meaningful.
- Name exports clearly, include format/version metadata in JSON, and avoid
  silently replacing user files or results.
- Document whether an applet opens directly, needs a local HTTP server, needs
  a local Python/Node process, or needs network access.
- Keep dependencies reproducible: lock Node dependencies and list Python
  dependencies in `requirements.txt`. Never commit virtual environments,
  `node_modules`, generated caches, or personal source material.

## Verification

The GitHub Actions `Verify` workflow is the repository baseline: JavaScript
syntax checks, Python compilation for PDF Ingest, and the Design Tokens build.
For maintained browser applets, also exercise the page in a real browser after
meaningful UI changes. Prioritise create/edit/export flows and the cross-tool
Edel-to-Ink export path; source checks alone do not validate canvas interaction
or downloads. Use [SMOKE_TESTS.md](SMOKE_TESTS.md) as the manual browser
checklist.
