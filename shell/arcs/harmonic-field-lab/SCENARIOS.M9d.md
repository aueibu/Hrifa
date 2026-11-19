# SCENARIOS M9d: Step | Landing measure, and the three fill-contrast fixes

Drafted and CONFIRMED 2026-11-18 from the human's picks. Human asked: "are the measurements being shown in comparison to the selected note or to 1/1? did we already discuss that?" (Not discussed before; the code measures the STEP.) Picked "Add a Step | Landing toggle" and "Fix those 3 fills". Storage: H-41.

## Step | Landing
| # | Case (source note 5/4) | Step (today, default) | Landing (new) |
| - | ---------------------- | --------------------- | ------------- |
| G1 | Rings: hover / color the 6/5 cell | measures 6/5: Tenney 4.91, error +15.6 c, prime 5 | measures the landing 3/2 from 1/1: Tenney 2.58, error +2.0 c, prime 3 |
| G2 | Near (meta ring on the source): a dot 81/64 | measures 81/64 | measures 5/4 × 81/64 = 405/256 from 1/1 |
| G3 | Near radius and the Entropy curve overlay | radius from the step's measure; curve at the step's cents | radius from the landing's measure; curve at the landing's cents (source cents + step) |
| G4 | Monzo: painted [-4 4 -1> and the matrix cells | the step 81/80 and the "only that exponent changed" steps | the landings 5/4 × step, from 1/1 (Octave Exact / Reduced applies to the landing) |
| G5 | Pin cards | colored as steps | colored as landings from the CURRENT source (a 6/5 card under source 5/4 shows 3/2's color) |
| G6 | Source 1/1 | identical to Landing | identical to Step |
| G7 | Control | a "Measure: Step \| Landing" toggle in the Color panel (and the Near-embedded controls), per view, saved with the view's channels; legends, Fit ranges and hover ticks follow it; the readout says which ("6/5 step" / "3/2 from 1/1") | |

## Fill contrast
| # | Fill | Was | Fix |
| - | ---- | --- | --- |
| G8 | light violet, strongest fill | text 3.28 : 1 | one step weaker for this hue's strongest fill so text >= 4.5 : 1 |
| G9 | light pink, strongest fill | 4.29 : 1 | same |
| G10 | dark cyan, strongest fill | 4.35 : 1 | same |
The all-hues contrast test then asserts no exceptions (the known-list is removed).

## M9d look (human, 2026-11-18)
| # | Case | Result |
| - | ---- | ------ |
| G11 | Hold ` (backtick) | Momentary Step <-> Landing flip of the open view's Measure while held (physical key Backquote; not while typing; keyup and window blur restore). Ctrl+Shift (ring jumps) and Ctrl+Alt (Alt = below; AltGr) rejected. |
| G12 | Alt held first, then 1/4/5 | The hold preview plays (was silent: the picker swallowed Alt+digit and the page ignores Alt+digit holds); the picker starts the hold itself. |
| G13 | Hold 4 | Plays the interval the colors measure: Step = source + landing; Landing (or ` held) = 1/1 + landing; follows a backtick tap live. |
| G14 | Readout, source 5/4, hover 5/4, Landing, Alt held | "· 1/1 from 1/1" (the below landing, as hold 4 plays); Step + Alt: "· 5/4 step down". |
| G15 | "Colors follow Alt" toggle (human: "im torn because I agree that the ring might just become a big flicker. Can you put a toggle in?") | Per view (Rings, Near; Monzo has no below: Alt there means "no paint"), default OFF. Off: colors, radius, pins and legend tick measure the ABOVE landing/step (today). On: while Alt is held they measure the below one (Landing: source ÷ step reduced into the repeat, so cell 5/4 from source 5/4 takes 1/1's color; Step: the step down, so only direction-dependent measures such as the signed 12-EDO error change). Saved with the view's channels (H-41 amended). |
