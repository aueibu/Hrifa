# Listener datasets (validation only)

Copied unchanged (UTF-8 BOM stripped) from the `inconData` R package by Peter M. C. Harrison,
https://github.com/pmcharrison/inconData (`data-raw/`), licensed **CC0**.

| File | Study | Content |
| --- | --- | --- |
| `dyads.csv`, `triads.csv`, `tetrads.csv` | Bowling, D. L., Purves, D., & Gill, K. Z. (2018). Vocal similarity predicts the relative attraction of musical chords. *PNAS*, 115(1), 216–221. https://doi.org/10.1073/pnas.1713206115 | Every 12-TET dyad, triad and tetrad in close position (the exact Hz played in `f_*`), mean attractiveness rating (1–4) with SD and SE. |
| `jl12-figure-2.csv`, `jl12-figure-3.csv` | Johnson-Laird, P. N., Kang, O. E., & Leong, Y. C. (2012). On musical dissonance. *Music Perception*, 30(1), 19–35. | Triads as MIDI voicings in several registers and inversions, mean rating, plus the paper's roughness and tonal model values. |
| `sch03-figure-6.txt` | Schwartz, D. A., Howe, C. Q., & Purves, D. (2003). The statistical structure of human speech sounds predicts musical universals. *Journal of Neuroscience*, 23(18), 7160–7168. | Consensus consonance ranking of the 12 dyads (1 = most consonant). |

Used only by tests under `src/lib/consonance/` to report how well each score tracks listener judgements. Citations to be checked by the M1 builder against the papers or the package documentation.
