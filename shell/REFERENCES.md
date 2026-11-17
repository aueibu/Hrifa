# References and credits (DRAFT)

A running list of the research, data and technology the shell and the harmonic field lab rely on. It is a draft for a future
"References" page in the app (see `BACKLOG.md`). Add a line whenever something is borrowed. Items marked `check` need their
exact source or license confirmed before they are shown on a page.

## Data and theory
- **Chord list** (M7, planned): `chordnam.par`, "List of chords for Scala" by Manuel Op de Coul, from the Scala program. The 399 colon-ratio entries become the chord library. Credit line is shown in the dialog and the glossary.
- **Scala** by Manuel Op de Coul: the manual (`Scala help.html`) is the model for the Pairs panel's `SHOW LOCATIONS` view (M1), the beat frequencies of `SHOW BEATS` (M3) and the `PRIMES` factorization display (M2). check: wording of the credit.
- **Euler-Fokker genus** (M6): Leonhard Euler's genus, as used by Adriaan Fokker. check: source text.
- **Combination product sets**: Erv Wilson (the lab's `cpsChords` comment names him). check: source text.
- **Tenney height**: James Tenney, used to rank how simple a ratio is (Pairs panel, tint, beats). check.
- **Harmonic entropy** (M9, planned): Paul Erlich. check.
- **Schillinger System of Musical Composition**: Joseph Schillinger (separate research in the repo, not the lab).

## Technology
- **Mantine** (React components, color scheme handling), via `mantinedev/vite-template`. MIT.
- **Radix Colors 3.0.0**: the color steps in `src/theme/radix.ts` (copied, MIT notice in that file).
- **Lucide**: 14 icon shapes in `src/pages/harmonic-field-lab/components/icons.tsx`, ISC license, notice in that file; https://lucide.dev.
- **Fonts**: DM Mono and Figtree (Google Fonts); Fraunces self-hosted (`src/theme/fonts.css`). check: licenses.
- **Bitwig Studio**: the dark neutral ramp in `src/theme/tokens.ts` was sampled from its UI (see `THEMING.md`). Inspiration only.
- **React, Vite, Vitest, Yarn Berry, oxfmt, oxlint, stylelint**: tooling.
