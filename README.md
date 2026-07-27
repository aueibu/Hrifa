# Hrifa

Hrifa is a collection of small visual tools and experiments. The root `index.html` is a portal to each applet.

## Add an applet

Add its files to a folder, then add an object to the `applets` array in `applets.js`. The catalogue entry is the portal's source of truth and must include its title, relative `href`, category, status, runtime, mark, and description. Follow [APPLET_CONVENTIONS.md](APPLET_CONVENTIONS.md) for the shared project contract.

## Publishing

For GitHub Pages, use **Settings → Pages**, choose **Deploy from a branch**, and select `main` with `/(root)`.
