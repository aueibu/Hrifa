# SCENARIOS M9c: Color channels (Radius, Hue, Brightness) and presets

Drafted 2026-11-18 at the M9 look. Human: "we have position around as pitch (good), vertical is currently a toggle between odd limit and tenney, but there is no reason to limit it to just those. And then you bring up that really brightness and hue are potentially 2 axes." -> "yes to option one - with the ramp fix as a background thing if we can still use it? The blue was a good option. If you could - also propose some sensible presets that the user could pick from too". Replaces the single Color select of M8o (D1-D25 otherwise stand).

Why: on the dark panel the violet shade dots measured 1.18 to 2.58 : 1 (invisible at the faint end). Dataviz rule: hue for identity or sign, lightness and position for magnitude; on dark the ramp's strong end is BRIGHT, its faint end still >= 2:1.

## Channels (per view; Rings and Monzo have Hue + Brightness; Near also Radius)
| Channel | Choices | Encodes |
| ------- | ------- | ------- |
| Radius (Near only; replaces Near's Odd limit / Tenney toggle) | Tenney, Odd limit, Roughness, Harmonic entropy, \|error\| | distance from the ring (as today for Tenney / Odd limit, with the ring labels T2..T14 generalized to the chosen metric's values) |
| Hue | Off, Prime, Interval class, Error sign | which family: Prime = Near's wheel hues; Interval class = Pairs Interval hues; Error sign = orange sharp / cyan flat / neutral exact (H-38) |
| Brightness | Off, Tenney, Odd limit, Roughness, Harmonic entropy, \|error\| | how much: bright = strong; "strong end" follows Interval intensity (Simple strong default); \|error\| uses the five errorBand bands (H-38) |

## Rules
| # | Case | Result |
| - | ---- | ------ |
| F1 | Hue Off, Brightness Tenney (dark) | the BLUE ramp: dots on steps 7..12 (contrast 2.1 .. 10.6 : 1), cell fills on a lifted tinted ramp so the faint end still reads as tinted; light scheme mirrored and checked against the light panel |
| F2 | Hue Prime, Brightness Harmonic entropy | 7/4: 7's hue, bright (HE dip); 81/80: 5's hue, dim. Brightness moves along that hue's own Radix steps |
| F3 | Hue Prime, Brightness Off | each prime at one fixed level (today's Prime look, tile look) |
| F4 | Hue Error sign, Brightness \|error\| | exactly the H-38 error look (5/4 -13.7 c: cyan band 2) |
| F5 | Hue Error sign, Brightness Tenney | sign from the error, lightness from Tenney |
| F6 | Both Off | plain cells and dots (as Color Off today) |
| F7 | Legend | a hue legend (swatches or the error strip) and a brightness bar (end values, strong end, hover tick); Range (Fixed / Fit) and Octave (Monzo) apply to Brightness; s slider shown when any channel uses HE |
| F8 | Storage (H-37 amended, new H- row) | `relColor` per view `{ hue, bright, range, octave? , radius? }`; old M8o `{ metric }` migrates: prime / interval -> hue; tenney / odd / roughness / entropy -> bright (hue off); error -> hue error-sign + bright \|error\|; Near's old measure toggle -> radius |

## Presets (one click sets the channels; the channels stay editable; a preset menu at the top of the panel)
| Preset | Radius (Near) | Hue | Brightness | Question it answers |
| ------ | ------------- | --- | ---------- | ------------------- |
| Families (default) | Tenney | Prime | Off | which harmonic family, how simple |
| Ear vs paper | Tenney | Prime | Harmonic entropy | simple on paper vs recognizable to the ear |
| Tuning check | Tenney | Error sign | \|error\| | which notes are sharp or flat, how far |
| Consonance | Harmonic entropy | Off | Roughness | the two consonance models against each other |
| Interval classes | Odd limit | Interval class | Tenney | where each interval class sits, by complexity |
| Plain | Tenney | Off | Off | position only |

F9 default for a first-time viewer: "Families". Table CONFIRMED by the human 2026-11-18 ("Yes, build it"). Storage: H-40.

## M9c look 1 (human, 2026-11-18)
| # | Case | Result |
| - | ---- | ------ |
| F10 | HE Fixed range (human: "yes exclude unison. but still plot it") | Fixed bounds for Harmonic entropy are the curve's min..max EXCLUDING ±30 c around 1/1 (and 2/1); values beyond the bounds clamp to the strong end for color; on the Near radius the unison dip is still drawn (inward past the innermost ring, not cut off). |
| F11 | Hue takes the measures too (human: "I do wish I could put the hue on all of the data types - sometimes I don't want to have to try and use brightness"; CONFIRMED) | Hue = Off / Prime / Interval class / Error sign / Tenney / Odd limit / Roughness / Harmonic entropy / \|error\|. A measure on Hue uses an ordered multi-hue ramp (viridis-like: deep blue -> teal -> green -> yellow, lightness rising monotonically, built from Radix hues), on fills and marks, so neighbors such as 3/2 (Tenney 2.58) and 5/4 (4.32) get different colors where the blue brightness fills put them in the same shade (dark fills have only 4 usable blue steps). |
| F12 | Hue and Brightness both measures (e.g. Hue Tenney, Brightness HE) | Hue follows its measure along the ramp; brightness moves that color's lightness. One Range (Fixed / Fit) and one Interval intensity apply to both measure channels. |
| F13 | Hue a measure, Brightness off | the ramp alone (the human's case: color without brightness). |
| F15 | M9c look 2: Radius HE or Roughness leaves holes around simple ratios (Farey gaps: no low-number ratios near p/q under the odd ceiling; ~±14 c around 1/1 at ceiling 123) | Human: "No, dots only": keep the holes (they show where no ratios exist); no continuous curve under the dots. The error strip legend now fits the 190 px panel (was min-width 14rem: "scale is busting out!"). |
| F14 | Legend | a measure on Hue shows the ramp as a gradient bar with end values and the hover tick (like the brightness bar). |
