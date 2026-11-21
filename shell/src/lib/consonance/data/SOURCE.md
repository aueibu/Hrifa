# Listener datasets (validation only)

Copied unchanged (UTF-8 BOM stripped) from the `inconData` R package by Peter M. C. Harrison,
https://github.com/pmcharrison/inconData (`data-raw/`), licensed **CC0**.

| File | Study | Content |
| --- | --- | --- |
| `dyads.csv`, `triads.csv`, `tetrads.csv` | Bowling, D. L., Purves, D., & Gill, K. Z. (2018). Vocal similarity predicts the relative attraction of musical chords. *PNAS*, 115(1), 216–221. https://doi.org/10.1073/pnas.1713206115 | Every 12-TET dyad, triad and tetrad in close position (the exact Hz played in `f_*`), mean attractiveness rating (1–4) with SD and SE. |
| `jl12-figure-2.csv`, `jl12-figure-3.csv` | Johnson-Laird, P. N., Kang, O. E., & Leong, Y. C. (2012). On musical dissonance. *Music Perception*, 30(1), 19–35. | Mean DISSONANCE rating (high = more dissonant) of chords as MIDI voicings in several registers and inversions, plus the paper's roughness and tonal model values (which `inconData` notes may contain mistakes; unused here). `jl12-figure-2.csv`: triads (55). `jl12-figure-3.csv`: four-note chords (48). |
| `sch03-figure-6.txt` | Schwartz, D. A., Howe, C. Q., & Purves, D. (2003). The statistical structure of human speech sounds predicts musical universals. *Journal of Neuroscience*, 23(18), 7160–7168. | Consensus consonance ranking of the 12 dyads (1 = most consonant). |

Used only by tests under `src/lib/consonance/` to report how well each score tracks listener judgements. Citations checked against the `inconData` and `incon` package bibliographies (M1).

The coefficients of the composite model in `composite.ts` come from Harrison, P. M. C., & Pearce, M. T. (2020). Simultaneous consonance in music perception and composition. *Psychological Review*, 127(2), 216–244. https://doi.org/10.1037/rev0000169 (Table 2, unstandardised), as implemented in `incon::har_19_composite_coef` (MIT).
