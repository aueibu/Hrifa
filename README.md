# Hrifa

Hrifa is a collection of visual and musical tools and experiments.

- `shell/`: the app everything new is built in (React + Vite + Mantine). Run
  `corepack yarn dev` from inside `shell/`.
- `research/` and `_Ideas/`: research code and notes the shell work draws on.
- `legacy/`: the archived vanilla-JS portal and standalone applets (see
  `legacy/README.md`).

## Publishing

GitHub Pages deploys from `.github/workflows/deploy-pages.yml` on every push to
`main`: it copies `legacy/` to the site root and layers the shell build on top,
so the old applet URLs keep working.
