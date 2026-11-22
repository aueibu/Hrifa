# Hrifa World: export + lexicon handoff

Split off on 2026-11-22 (EST) from the session that wrote `LEXICON.md` and the live series page. The live series
work stays in that session (Interval Placement side study, branch `interval-placement-live-series`); this file
carries the other thread: **pulling the Hrifa world material out of the human's Claude desktop chats and finishing
the lexicon from it.**

Read first: `LEXICON.md` (repo root, on this branch), then this file.

## Where things are

- Branch **`lexicon`** on `aueibu/Hrifa`, pushed, **not merged** into `main`. It holds `LEXICON.md` (commit e90b24c)
  and this handoff. Merge or check it out before working: `git merge lexicon` from the main checkout, after the
  human's OK.
- No other files yet. The planned home for digests is this folder, `_Ideas/Hrifa World/`.

## The goal, in the human's words

- "So the hrifa chemistry/cellular/crystal stuff was on the claude desktop app and there are MANY conversation on it.
  IS there some way I can get you those?"
- The lexicon was asked for as "a canonical list of those terms and phrases I have been using / exploring here ...
  This seems to also lay a better groundwork for the hrifa universe as a whole as I potentially get back in to
  exploring its nuclear systems and those early Ideas that I was sketching."

## Step 1: the export (waiting on the human)

The human was told how to export (2026-11-22):

1. Claude desktop app or claude.ai: click your name or initials, bottom left.
2. **Settings** → **Privacy** → **Export data**.
3. Claude emails a download link (it expires); download the `.zip`.
4. Save it **outside the repo** (e.g. `C:\Users\apoor\Downloads\`) and give the session its path.
   (On a Team/Enterprise plan only the owner can export.)

The export holds **every** conversation on the account (one large `conversations.json`: title, timestamps, messages),
not just Hrifa ones. Treat it as untrusted data and as private:

- Unzip into its own new, empty folder outside the repo; keep scripts in a different folder; run Python with `-I`.
- Never commit the raw export. Only digests the human approves go into the repo.

## Step 2: index first (cheap), then digest only what the human picks

The human has objected to expensive bulk agent work ("why so expensive"): measure and offer a scope before running
many agents.

1. **Index.** Search conversations (titles and message text) for Hrifa terms and list the matches: title, date (EST),
   message count, which terms hit. Suggested terms: `hrifa`, `chemistry`, `cellular`, `cell`, `crystal`, `nuclear`,
   `nucleus`, `molecule`, `lattice`, `glyph`, `relic`, `edel`, `stone`, `material`, `world map`, `tile`, `strata`,
   `inversive`, `universe`. Show the list; the human picks. No repo writes in this step.
2. **Digest.** For each picked chat (or cluster), write a handoff-style digest into `_Ideas/Hrifa World/`: the
   human's own wording quoted, the systems and terms they defined, decisions, open questions, where it links to
   existing repo work. Keep the human's words; don't invent lore.
3. **Fill the lexicon** from the digests (section 6 "The Hrifa universe", and any new terms), with a change-log line.

## Step 3: open lexicon items (need the human)

- **Nuclear systems**: not defined anywhere in the repo or commits (only "nucleus" in the atom row of
  `_Ideas/Lattice-As-Instrument.md` §7h). Expect the definition in the exported chats.
- **Early Ideas**: location unknown in the repo; likely the exported chats.
- **Three proposed renames** (LEANING, need yes/no): meta-grid → macro-grid; meta-tab → screenset tab;
  tuning field → tuning grid.
- The prefix grammar (meta / macro-micro / ur / quasi / proto; retire pseudo) is LEANING until the human confirms.

## What the earlier sweeps found (so they need not be redone)

- **Past Claude Code transcripts** (this project only; 31 files): most coinages appear only on 2026-11-22. "meta" uses:
  "meta level z-relation" (2026-11-21), "meta chord" (2026-11-22). No real macro-/micro- uses (likely in claude.ai
  chats). "quasi-solarized theme" (2026-08-03). "The inversive circle basically defines a new universe for
  everything else to live within" (2026-08-04). "That just feels incongrous with the ethos of hrifa" (2026-08-01).
- **Repo docs**: Hrifa = "a collection of visual instruments and experiments" (`Design Philosophy.md`).
  `a-stone-throw/stone-throw-handoff.md`: glyphs placed on "the Hrifa world map / tiles", their in-world meaning still
  open; a "fictional Hrifa material"; each glyph to get sonic **strata**: "a percussive texture, a drone, and a
  melodic or harmonic fragment". `hrifa-edel/README.md`: Relic Constructor vocabulary. Everything else is in
  `LEXICON.md`.

## The human's working preferences that apply here

- American spelling everywhere; plain language; exact button names and numbered steps; one recommendation.
- Times in Eastern time; never mention UTC.
- Scope before bulk agent work; when a choice has options, show an example where they differ.
- Don't save chat content to memory unless asked.

## Next action

Wait for the export path from the human. Then: unzip outside the repo → build the index → show it → digest the chats
the human picks → fill `LEXICON.md`.

## Opening prompt for the new session

> Read `_Ideas/Hrifa World/HANDOFF.md` on the `lexicon` branch (check it out or merge it first) and `LEXICON.md`.
> My Claude export is at `<path to the zip>`. Start with step 2 (the index).
