# Time-Derived Username

A small, static webpage that derives a deterministic compound username from the visitor's local time. It makes no network requests, stores no data, and works by opening `index.html` directly.

## How names are derived

There are two editable word lists near the top of `script.js`: an A list and a B list. Their lengths are unrestricted (but neither may be empty), and together they make `A length × B length` possible names.

Each complete list cycle lasts exactly three hours (10,800,000 milliseconds). The page finds the current position within that cycle, scales it to the number of available pairs, and uses the resulting flat index:

```
A index = Math.floor(flat index / wordsB.length)
B index = flat index % wordsB.length
username = wordsA[A index] + wordsB[B index]
```

The flat index is used rather than calculating each list index independently. The A word changes on every successive index, while the B word is offset by an automatically chosen coprime stride. This interleaves the sequence instead of grouping all variations of one A word together, while preserving the full Cartesian product even when the two list lengths share a factor.

To replace the words, edit `wordsA` and `wordsB` in `script.js`. Use any number of entries in either list; the app shows a visible configuration error only if a list is empty.

The page also has an **Edit word lists** panel. Saving there stores custom lists only in that browser using `localStorage`; they are not uploaded or shared. **Restore defaults** removes the locally saved lists and returns to the built-in defaults.

## Run locally

Open `index.html` in a modern browser. No server, build tool, framework, or package installation is needed.

## GitHub Pages deployment

Push these files to a repository, then in GitHub open:

```
Repository Settings
→ Pages
→ Deploy from a branch
→ main
→ /root
```

Save the setting and GitHub Pages will publish the static site.

For a custom domain, `deriveuser.eipgam.com` can point to GitHub Pages through DNS plus the repository's GitHub Pages custom-domain setting. A path such as `eipgam.com/deriveuser/` cannot be configured through DNS alone; it is easiest when the primary domain site is hosted in the same GitHub Pages structure, or its host is configured to route that path to this site.

`eipgam` is only an example hosting domain and is not part of the name lists.
