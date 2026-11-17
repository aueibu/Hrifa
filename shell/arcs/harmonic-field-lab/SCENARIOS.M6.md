# M6 scenarios: Euler-Fokker genus and odd limit on generators

DRAFT 2026-11-16, not yet confirmed by the human. Nothing is built. Values below were computed by hand from the definition and must be re-checked against the real generator (script) before they become tests.

## What a genus is
Pick a whole number n and factor it, for example 45 = 3 x 3 x 5 = 3^2 x 5. The genus is the set of every divisor of n, each divided by a power of 2 until it sits in one octave (1 up to but not including 2). It is a lattice box: one axis per prime, the exponent of each prime running from 0 up to its power in n.

## What exists today
- The generator column has the **box** (lattice) method: one axis per prime with a generator, a count and a center. A genus is exactly a box where each prime p is an axis with generator p, count (power + 1) and center 0, folded into the octave. The form shows only 3 axes.
- A **prime mask** already filters a field (which primes are allowed). Notes with no exact ratio (EDO notes) are kept by the mask.
- Nothing filters by **odd limit** (the largest odd number in a ratio, e.g. 15/8 has odd limit 15).

## Proposed design
1. **A new generator method "Genus"** with one text box, n, any number of primes. The box accepts `45`, `3^2*5` or `3 3 5`, and shows what it understood (`3^2 x 5, 6 notes`). It builds the genus above. Like every generator it gets the usual repeat, prime mask and subset handling.
2. **An "Odd limit" box beside the prime mask on every generator:** keep only notes whose ratio has an odd limit of at most the number typed; empty = no filter.
3. The odd limit and the genus enter a generator's identity (what makes two generators "the same preset") only when they are set, so every stored generator and preset keeps its current identity.

## Scenarios (the human's real cases to confirm)

| # | Setup | Expected notes (as ratios, ascending) |
| --- | --- | --- |
| 1 | Genus, n = 45 (3^2 x 5) | 1/1, 9/8, 5/4, 45/32, 3/2, 15/8 (6 notes: the divisors 1, 3, 5, 9, 15, 45 folded into the octave) |
| 2 | Genus, n = 105 (3 x 5 x 7) | 1/1, 35/32, 5/4, 21/16, 3/2, 105/64, 7/4, 15/8 (8 notes) |
| 3 | Genus, n = 225 (3^2 x 5^2) | 1/1, 9/8, 75/64, 5/4, 45/32, 3/2, 25/16, 225/128, 15/8 (9 notes) |
| 4 | Genus, n = 1 | one note, 1/1 |
| 5 | Genus, n = 32 (2^5) | one note, 1/1 (powers of 2 vanish in the octave) |
| 6 | Genus, text `abc`, `0`, `-5`, `3.5` | refused inline ("Type a whole number such as 45 or 3^2*5"); the field stays as it was |
| 7 | Genus, n = 3^10 x 5^10 x 7^10 (1331 notes) | built (under the 2048 cap); n = 3^11 x 5^11 x 7^11 (1728, still under) built; a product over the 2048-note cap is refused with the count ("this genus has 4096 notes, the limit is 2048") |
| 8 | Harmonics 1 to 16 reduced to the octave (1/1, 9/8, 5/4, 11/8, 3/2, 13/8, 7/4, 15/8), odd limit 9 | 1/1, 9/8, 5/4, 3/2, 7/4 (11, 13 and 15 are over 9) |
| 9 | 5-limit major scale (1/1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8), odd limit 5 | 1/1, 5/4, 4/3, 3/2, 5/3 (9/8 and 15/8 are over 5) |
| 10 | Same scale, odd limit 15 | all 7 notes (the highest odd limit is 15) |
| 11 | Same scale, odd limit empty | all 7 notes, identity unchanged from before M6 |
| 12 | 12-EDO field, odd limit 5 | see D2: the 12 notes have no ratio, so what stays? |
| 13 | A generator with the prime mask 3-limit and odd limit 9 | the notes passing BOTH (the filters add up) |
| 14 | Genus 45 saved as a preset, reloaded | the same 6 notes; the stored preset contains n and nothing computed |
| 15 | A preset saved before M6 | opens unchanged (no odd limit, no genus) |

## Decisions for the human (recommendation first)
- **D1 Is the box form still wanted?** The ARC also asks for "a form that fills the box generator for up to 3 primes". The new Genus method covers every case that form would, with one box instead of several. Recommended: build only the Genus method (it already works for 1, 2, 3 or more primes) and skip the box fill. Alternative: add a "Fill the box from n" button on the box generator too.
- **D2 What the odd limit does to a note with no ratio (EDO notes).** Recommended: keep it, as the prime mask does (the filter only judges notes that have a ratio). Example: 12-EDO with odd limit 5 stays all 12 notes. Alternative: drop it, so 12-EDO with odd limit 5 gives an empty field (a refusal message: "no notes left").
- **D3 Where the Genus method lives in the menu.** Recommended: beside the box method in the generator method list, named "Genus (Euler-Fokker)". Say if you want it elsewhere.
- **D4 Where the Odd limit box sits.** Recommended: right under the prime mask, on every generator method, labeled "Odd limit".

Storage (needs your OK, then `DECISIONS.md` `H-27`): generator settings gain `oddLimit` (a whole number, written only when set) and the new method `genus` with `n` (a whole number, written only when the method is Genus). An unknown stored method falls back to harmonic today, so older versions of the app read a Genus preset as harmonic; this is the same behavior as for every new method.
