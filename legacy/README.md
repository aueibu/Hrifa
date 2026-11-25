# Hrifa legacy portal (archived)

> **Archived 2026-11-25.** This folder is the old vanilla-JS portal and its standalone applets, moved here from the repo root unchanged. New work happens in `shell/`; applets leave this folder only by being ported there. The Pages deploy still copies this folder to the site root, so the applets keep their old URLs. Paths below are relative to `legacy/`.

Hrifa is a collection of small visual tools and experiments. `index.html` is a portal to each applet.

## Add an applet

Add its files to a folder, then add an object to the `applets` array in `applets.js`. The catalogue entry is the portal's source of truth and must include its title, relative `href`, category, status, runtime, mark, and description. Follow [APPLET_CONVENTIONS.md](APPLET_CONVENTIONS.md) for the shared project contract.

## Publishing

Publishing is done by `.github/workflows/deploy-pages.yml` at the repo root: it copies `legacy/` to the site root and layers the shell build on top.
