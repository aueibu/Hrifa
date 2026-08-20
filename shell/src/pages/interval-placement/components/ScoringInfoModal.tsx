import { Divider, Modal, Stack, Table, Text, Title } from '@mantine/core';
import { Equation } from '../../../components/Equation/Equation';
import { Reading } from '../../../components/Reading/Reading';

interface ScoringInfoModalProps {
  opened: boolean;
  onClose: () => void;
}

interface Term {
  name: string;
  equation: string;
  literature: string;
  consequence: string;
}

const V1_TERMS: Term[] = [
  {
    name: 'Ratio cost',
    equation:
      '\\text{cost} = \\min_{(n,d)} \\left[ \\frac{(\\text{cents} - 1200\\log_2(n/d))^2}{\\sigma^2} + \\lambda \\log_2(nd) \\right]',
    literature:
      'A nearest-simple-ratio search — a hand-built proxy for just-intonation consonance, penalized by Tenney height (log2(n·d), Tenney 1988) so that simpler ratios (lower n·d) cost less at equal cents-distance. σ (sigmaCents) sets tuning tolerance; λ (ratioLambda) weights simplicity against exactness.',
    consequence:
      'Intervals near a simple ratio (3/2, 4/3, 5/4…) score low cost even slightly detuned; intervals nowhere near any low-n/d ratio score high regardless of tuning. This is what makes a fifth read as consonant and a tritone read as dissonant in the base model.',
  },
  {
    name: 'Roughness (Kameoka & Kuriyagawa-style)',
    equation:
      '\\text{rough} = \\sum_{i,j} \\frac{1}{i^p j^p}\\left[e^{-ax} - e^{-bx}\\right], \\quad x = \\frac{|f_i - f_j|}{1.72\\,\\bar f^{\\,0.65}}',
    literature:
      'A Sethares (1993) dissonance-curve fit to Plomp & Levelt\'s (1965) critical-band beating data, summed over harmonic partials i,j (1..K) of the two notes, amplitude-weighted by 1/harmonic^p. The 1.72·f̄^0.65 term approximates critical bandwidth as a function of mean partial frequency f̄.',
    consequence:
      'Two notes whose overtones fall within the same critical band beat against each other and sound rough, regardless of whether their interval is a "simple" ratio — this is why a very close, low cluster can sound harsh even though the interval itself might be small.',
  },
  {
    name: 'Register damping',
    equation:
      'r = \\begin{cases} e^{-k \\cdot \\text{lo}/L} & \\text{damping on} \\\\ 1 & \\text{damping off} \\end{cases}',
    literature:
      'A hand-tuned exponential rolloff (k = registerDampingK) applied by pitch position within the window, not attributed to a specific published model.',
    consequence:
      'Dissonance penalties shrink for pitches sitting higher in the voicing\'s window when the toggle is on — the same interval "stings less" up high. Note: the roughness term above is already frequency-dependent via f̄^0.65, so this is a second, independent register effect layered on top of the first — worth checking whether the two are compounding rather than modeling separate things.',
  },
  {
    name: 'Compound relief',
    equation: 'c = e^{-m \\lfloor d_{\\text{steps}} / N \\rfloor}',
    literature: 'Reflects octave equivalence — well-established in pitch perception generally — via a hand-picked decay rate m (compoundReliefM), not fit to data.',
    consequence:
      'An interval stretched across extra octaves (a 10th vs. a 3rd) gets progressively less penalty per additional octave, matching the intuition that octave-related intervals feel more "relieved" than their raw step-distance suggests.',
  },
  {
    name: 'perPair (what Results sorts by)',
    equation:
      '\\text{perPair} = \\frac{\\sum_{\\text{pairs}} \\left[\\text{cost} + \\alpha_{\\text{rough}} \\cdot \\text{rough}\\right] \\cdot r \\cdot c}{\\binom{n}{2}}',
    literature: 'A flat, unweighted mean over every dyad in the voicing — every pair counts equally regardless of register or spacing.',
    consequence:
      'A close inner-voice dyad and a widely spaced outer dyad contribute identically to the score. This is a known weak spot of pairwise-sum chord-dissonance models generally — real chord dissonance judgments weight bass/close-position dyads more heavily (see Parncutt, v2 tab).',
  },
];

const V2_TERMS: Term[] = [
  {
    name: 'Roughness (ERB-based) — the R column',
    equation:
      '\\begin{aligned} \\text{ERB}(f) &= 24.7\\left(4.37\\tfrac{f}{1000} + 1\\right)\\ \\text{Hz} \\\\ \\text{roughness} &= \\sum_{\\substack{\\text{cross-note} \\\\ \\text{partial pairs}}} a_i a_j \\left[e^{-ax} - e^{-bx}\\right] w_{\\text{mask}}, \\quad x = \\frac{|f_i - f_j|}{\\text{ERB}(\\bar f)} \\end{aligned}',
    literature:
      'Same Sethares (1993/2005) dissonance curve as v1, but driven by ERB (Equivalent Rectangular Bandwidth) — a measure of the ear\'s critical-band filter width at a given frequency, from Glasberg & Moore (1990) — instead of the 1.72·f̄^0.65 approximation. ERB is the modern standard model of how critical bandwidth actually scales with frequency. Computed over the whole chord\'s combined partials (the overtones each note produces, per Fourier/harmonic-series decomposition — not just its fundamental) at once, with a lightweight masking term (a loud nearby partial damps a weaker one\'s contribution), loosely following Hutchinson & Knopoff (1978).',
    consequence:
      'Because ERB bandwidth is inherently frequency-dependent, the same step interval reads as rougher in a low register on its own — no separate register-damping multiplier needed. This is the direct fix for the v1 double-counting concern above.',
  },
  {
    name: 'Ambiguity (harmonic entropy) — the A column',
    equation:
      'H = -\\sum_{r} p(r)\\log_2 p(r), \\quad p(r) \\propto \\exp\\!\\left(-\\tfrac12\\left(\\frac{\\text{cents}-\\text{target}(r)}{\\sigma}\\right)^{\\!2}\\right)',
    literature:
      'Harmonic entropy (Erlich; formalized by Sethares & Milne) — the Shannon entropy of a listener\'s ratio hypotheses for a tempered interval, given realistic tuning-perception noise. Replaces v1\'s single-nearest-ratio-plus-Tenney-height search with a proper probabilistic model over the full ratio set (denominators up to 32, within one octave).',
    consequence:
      'Low entropy = the interval unambiguously implies one simple ratio (a perfect fifth, barely detuned, still reads as "the fifth"). High entropy = many comparably plausible ratios — the interval sits in a perceptual no-man\'s-land between simple ratios, which is exactly what makes it feel unstable/ambiguous rather than just "dissonant." The equation above scores one dyad — see below for how a whole chord\'s A value is built from all of its dyads.',
  },
  {
    name: 'How A gets averaged across a chord',
    equation:
      'w(\\text{dyad}) = \\frac{1}{1+\\text{gap}/12} \\times \\begin{cases} 1.5 & \\text{bass pair} \\\\ 1 & \\text{otherwise} \\end{cases}, \\qquad A = \\frac{\\sum_{\\text{dyads}} H \\cdot w}{\\sum_{\\text{dyads}} w}',
    literature:
      'Follows Parncutt\'s general finding that bass and close-position dyads dominate perceived chord dissonance more than distant upper-structure dyads — the specific weighting curve here is a reasonable guess, not fit to data.',
    consequence:
      'Not a separate score — this is how the A column above is built from a chord\'s several dyads: a weighted average of each dyad\'s harmonic entropy, not a plain mean. A close bass-relative dyad pulls the chord\'s A value toward its own harmonic entropy much more than a distant, widely-spaced upper dyad does — unlike v1\'s perPair, which treats every dyad identically. If you were expecting to see this as its own number in Results, that\'s the one place it isn\'t — it only ever shows up baked into A.',
  },
  {
    name: 'Harmonicity (virtual pitch) — the H column',
    equation:
      '\\begin{aligned} \\text{score}(f_0) &= \\sum_{f} \\max_{k=1..8} \\begin{cases} 1/k & |1200\\log_2(f/(f_0 k))| \\le \\text{tol} \\\\ 0 & \\text{otherwise} \\end{cases} \\\\ \\text{harmonicity} &= \\frac{\\max_{f_0} \\text{score}(f_0)}{n} \\end{aligned}',
    literature:
      'A simplified Terhardt (1982) virtual-pitch model / Parncutt (1989) root-support score. Candidate fundamentals are each note\'s own frequency divided by small integers (its possible subharmonics); each candidate is scored by how many chord tones land near one of its low harmonics, weighted 1/harmonic-number.',
    consequence:
      'Entirely absent from v1. Chords that approximate a harmonic series (an "otonal" chord — one built from a shared fundamental\'s overtones, like a major triad in root position) score high here — read as more "fused"/consonant — independent of how rough or ratio-ambiguous their individual dyads are. This is the axis that explains why a root-position triad feels more settled than an inversion with the identical set of intervals. Unlike A, this is computed once for the whole chord — there\'s no per-dyad weighting step for it.',
  },
  {
    name: 'Composite (v2, shown in Results)',
    equation:
      '\\text{combined} = \\frac{\\text{roughness}}{4} + \\frac{\\text{ambiguity}}{5} - \\text{harmonicity}',
    literature:
      'Not from the literature — this is a placeholder. McDermott, Lehr & Oxenham (2010, Current Biology) psychophysically dissociated roughness, harmonicity, and familiarity as independent predictors of chord preference, and fit real combination weights from listening-test data. No comparable dataset exists here, so /4 and /5 are guessed scale-matching constants, not calibrated weights.',
    consequence:
      'Treat this number as a rough single-column sort convenience, not a validated score. The three sub-scores (R/A/H, shown alongside it in Results) are the parts actually grounded in named models — when they disagree with each other, that disagreement is real signal the composite hides.',
  },
];

function TermSection({ term }: { term: Term }) {
  return (
    <Stack gap={8}>
      <Text fw={700} size="lg">
        {term.name}
      </Text>
      <Equation>{term.equation}</Equation>
      <Reading size="lg" c="dimmed">
        {term.literature}
      </Reading>
      <Reading size="lg">{term.consequence}</Reading>
    </Stack>
  );
}

/**
 * Reference for both scoring systems (see `intervalMath.ts` for v1,
 * `psychoacousticsV2.ts` for v2): the actual equation each term computes,
 * the published model (or lack of one) it's drawn from, and what it means
 * for how a voicing sounds. Content here should stay in sync with those
 * two files' own doc comments — this is a rendering of the same claims,
 * not a separate source of truth.
 */
export function ScoringInfoModal({ opened, onClose }: ScoringInfoModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Scoring reference" size="xl">
      <Stack gap="lg">
        <Reading size="lg" c="dimmed">
          Every voicing gets scored twice: <strong>v1</strong>, the model this app shipped with
          (still what Results is sorted by), and <strong>v2</strong>, a draft alternative built
          from named psychoacoustic literature instead of one hand-tuned formula. v2 is shown
          alongside v1 for comparison — it doesn&apos;t drive ranking.
        </Reading>

        <div>
          <Title order={3} size="h5" mb="xs">
            v1 — shipped model
          </Title>
          <Stack gap="md">
            {V1_TERMS.map((t) => (
              <TermSection key={t.name} term={t} />
            ))}
          </Stack>
        </div>

        <Divider />

        <div>
          <Title order={3} size="h5" mb="xs">
            v2 — draft alternative
          </Title>
          <Stack gap="md">
            {V2_TERMS.map((t) => (
              <TermSection key={t.name} term={t} />
            ))}
          </Stack>
        </div>

        <Divider />

        <div>
          <Title order={3} size="h5" mb="xs">
            References
          </Title>
          <Table withRowBorders={false} horizontalSpacing="xs" verticalSpacing={2}>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>
                  <Text size="xs">Plomp, R. &amp; Levelt, W. (1965)</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    Tonal Consonance and Critical Bandwidth — the original beating/roughness data both roughness models fit.
                  </Text>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Text size="xs">Sethares, W. (1993, 2005)</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    Tuning, Timbre, Spectrum, Scale — the dissonance-curve formula both v1 and v2&apos;s roughness terms use.
                  </Text>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Text size="xs">Glasberg, B. &amp; Moore, B. (1990)</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    Derivation of ERB (Equivalent Rectangular Bandwidth) values — v2&apos;s critical-bandwidth term.
                  </Text>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Text size="xs">Hutchinson, W. &amp; Knopoff, L. (1978)</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">The Acoustic Component of Western Consonance — full-spectrum roughness and partial-masking treatment.</Text>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Text size="xs">Erlich, P.; Sethares &amp; Milne</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">Harmonic entropy — the probabilistic ratio-ambiguity model v2 uses in place of v1&apos;s nearest-ratio search.</Text>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Text size="xs">Terhardt, E. (1982)</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">Virtual pitch / subharmonic template matching — v2&apos;s harmonicity score.</Text>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Text size="xs">Parncutt, R. (1989)</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">Harmony: A Psychoacoustical Approach — root support and bass-weighted dyad salience.</Text>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Text size="xs">Tenney, J. (1988)</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">Tenney height (log2(n·d)) — v1&apos;s ratio-complexity penalty.</Text>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Text size="xs">McDermott, Lehr &amp; Oxenham (2010)</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    Psychophysically dissociated roughness, harmonicity, and familiarity as independent
                    predictors of chord preference — the basis for keeping v2&apos;s three sub-scores
                    separate rather than pre-blended.
                  </Text>
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </div>

      </Stack>
    </Modal>
  );
}
