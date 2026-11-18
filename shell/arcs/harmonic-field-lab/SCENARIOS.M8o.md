# SCENARIOS M8o: Color menu on the Relative picker

Drafted 2026-11-18 from the human's answers: metrics Off, Prime, Tenney, Odd limit, Error vs 12-EDO, Interval class, Roughness; tinted fill (Radix tile tint, readable text) on ring cells and pin cards; saved in `settings.v1`; "a little menu on the actual popup modal just like we have in the near picker"; range "toggleable"; one Color for Rings, Near and Monzo (replaces Near's "Color by prime"); Monzo matrix: "color each cell to show what that value would be if only that exponent was changed".

## Menu
| # | Action | Result |
| - | ------ | ------ |
| D1 | Open the picker (Rings, Near or Monzo) | A small settings panel on the popup, built like the Near panel (`metaPanel`): **Color** Off / Prime / Tenney / Odd limit / Error / Interval / Roughness, and **Range** Fixed / Fit to view (Range shown only for Tenney, Odd limit, Roughness, Error). Same choice in all three views. |
| D2 | Reload | Color and Range come back (`settings.v1`, new H- row). |
| D3 | Near view | Near's own "Color by prime" checkbox is gone; Color = Prime gives the same dot colors it gave. |

## Ring cells and pin cards (example: cells 3/2, 5/4, 7/4, 81/80)
| # | Color | 3/2 | 5/4 | 7/4 | 81/80 |
| - | ----- | --- | --- | --- | ----- |
| D4 | Prime | 3's hue | 5's hue | 7's hue | 5's hue (same as 5/4) |
| D5 | Tenney, Fixed | 2.58 lightest | 4.32 light | 4.81 light | 12.66 darkest |
| D6 | Tenney, Fit to view, view shows up to 7/4 only | lightest | mid | darkest | (not shown) |
| D7 | Odd limit | 3 | 5 | 7 | 81 (light to dark, like Tenney) |
| D8 | Error vs 12-EDO | +2.0 c, faint sharp | -13.7 c, flat | -31.2 c, strong flat | +21.5 c, sharp |
| D9 | Interval class | fifth hue | major-third hue | minor-seventh hue | unison hue (Pairs Interval colors) |
| D10 | Roughness | smooth | smooth | fairly smooth | rough (the lab's roughness for the dyad) |
| D11 | Any color, pin 7/4 | The 7/4 card has exactly the 7/4 cell's tint; with Fit to view a card uses the open view's range (may differ from when it was pinned). |
| D12 | Color Off | Cells and cards look as today. |

## Monzo matrix (painted 81/80 = [-4 4 -1>)
| # | Cell | Interval it stands for (only that exponent changed) | Prime | Tenney (exact monzo) |
| - | ---- | --------------------------------------------------- | ----- | ------------------- |
| D13 | prime 5, exponent 0 | [-4 4 0> = 81/16 | 3's hue | 10.34 |
| D14 | prime 3, exponent 0 | [-4 0 -1> = 1/80 | 5's hue | 6.32 |
| D15 | prime 7, exponent 1 | [-4 4 -1 1> = 567/80 | 7's hue | 15.47 |
| D16 | the painted cells themselves | 81/80 | 5's hue | 12.66 |
| D17 | nothing painted | each cell = that prime power alone (prime 5, exponent 2 = 25/1) | | |
| D18 | Monzo pin cards and the landing mark | the monzo's own color | | |

D19 default Color for a first-time viewer: **Prime** (human, 2026-11-18).
D20 Monzo cells, exact vs octave-reduced: **a toggle for both** (human: "toggle for both"): Octave: Exact (81/16 = 10.34) | Reduced (81/64 = 12.34), in the same panel, saved with Color and Range.
Table CONFIRMED 2026-11-18 (the "Close, but" was the Monzo octave toggle, D20).
D22 (look 1, human: "where did you get these horrible flat 1998 ms paint colors?"): Prime cell and card fills were Near's solid dot colors (`wheelFill`, black/white text), against D-paint "tinted fill like the Pairs tiles". All cell and card fills follow the lab's tile look (`developer.v1` tileLook; default Tinted = Radix steps 3-5 background, step 11 text, via `TILE`), for every metric. Near dots keep the solid prime colors.
D23 Legend (human: "We also need to show a scale for each of these so the user knows what the colors even mean or could span"; CONFIRMED with hover tick): in the Color panel under Color. Prime = one labeled swatch per prime in view (copy Near's prime legend); Tenney / Odd limit / Roughness = gradient bar with end values (fixed bounds, or the view's min..max with Fit to view), strong end labeled simple or complex per Interval intensity; Error = two-sided bar flat -50 c .. 0 .. +50 c sharp; Interval = 12 class swatches (unison .. M7); Off = none. Hovering a ring cell, Near dot, Monzo cell or pin card marks its value (a tick on the bar, or its swatch highlighted).
D24 (human: "can the coloration selection be per picker module? near, ring, monzo?"): Color and Range are chosen PER VIEW (Rings, Near, Monzo; Octave Monzo only), each defaulting to Prime / Fixed (/ Exact). Ring pin cards follow the OPEN view (Rings: Rings' color; Near: Near's), monzo pin cards use Monzo's. Interval intensity stays one lab-wide setting. Supersedes D1's "same choice in all three views".
D25: the picker's Error legend is the same gradient strip as Modes and Pairs (`SignedErrorLegend`), with the hover tick on it.
D21 AMENDED 2026-11-18 (human: "pairs intensity sets literally complex strong or simple strong. thats not a volume knob thats a mapping"): the direction setting already existed as the Developer menu's **Interval intensity** (Complex strong | Simple strong, Tenney height). Merged: ONE setting named "Interval intensity" with "Simple strong | Complex strong" wording ("easier to parse"), read by Pairs and the picker; default **Simple strong** (was Complex strong for Pairs); a stored choice is kept. The separate `shadeEmphasis` is removed. Superseded text follows.
D21 (superseded) Shading direction, one lab-wide setting by EMPHASIS (human picked over lightness): **Simple stands out** (default) | **Complex stands out**. Simple stands out = 3/2 gets the strongest tint in both themes, 81/80 the faintest; Complex stands out flips it. Lives with the lab's other look options in the Developer menu (`developer.v1`, beside tile look and interval intensity); the picker's Color panel shows the same value as a shortcut (one value, two places). Every shaded metric (Tenney, Odd limit, Roughness; Error by size of error) and every later shaded view reads it through one shading function.
