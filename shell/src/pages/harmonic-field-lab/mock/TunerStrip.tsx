/**
 * Tuner strip: the field notes by pitch with their sharp/flat bars and the scale steps right under them. Faint
 * vertical reference lines mark every 100 c (1/1 as C): lighter for a white key, darker for a black key. The strip and
 * the saved-subset rows share one gutter and one cents scale (`stripLeft`), so a note is in the same column everywhere.
 */
import { useMemo, type CSSProperties } from 'react';
import { NativeSelect, NumberInput } from '@mantine/core';
import { LIT_FIELD, analysis, fieldDevs, rel, repC, savedSubsets } from './mockData';
import { Num, Strip, Tip, signed, useLab } from './ui';
import classes from './mock.module.css';

const PAD = 4;
/** Horizontal position (percent of the plot width) of a pitch in cents above 1/1: the one scale every strip uses. */
export const stripLeft = (c: number) => `${PAD + (c / repC) * (100 - 2 * PAD)}%`;
const BLACK = new Set([1, 3, 6, 8, 10]);

/** A quiet reference line at every 100 c: absolute 12-EDO pitch (1/1 = C), light for white keys, dark for black. */
export function RefLines({ thin }: { thin?: boolean }) {
  return (
    <div className={classes.refs} aria-hidden="true">
      {Array.from({ length: 13 }, (_, i) => (
        <span
          key={i}
          className={classes.ref}
          data-black={BLACK.has(i % 12)}
          data-thin={thin ? 'true' : undefined}
          style={{ left: stripLeft(i * 100) }}
        />
      ))}
    </div>
  );
}

export function TunerStrip() {
  const lab = useLab();
  // same selection as the ring: a hovered saved subset previews, otherwise the loaded one
  const on = useMemo(
    () => new Set(lab.preview ?? savedSubsets[lab.loaded].idx),
    [lab.preview, lab.loaded]
  );
  return (
    <section className={classes.tuner} aria-label="Tuner strip">
      <Strip title={<Tip k="tunerStrip">Tuner strip</Tip>}>
        <Tip k="compareTo" as="control">
          <NativeSelect
            size="xs"
            aria-label="Compare to"
            data={['12-EDO', 'Picked scale', 'JI (odd limit)', 'm-EDO']}
            defaultValue="12-EDO"
            w={116}
          />
        </Tip>
        <Tip k="oddLimitPick" as="control">
          <NumberInput
            size="xs"
            aria-label="Odd limit"
            prefix="odd ≤ "
            defaultValue={15}
            w={78}
            hideControls
          />
        </Tip>
      </Strip>
      <div className={classes.stripBody}>
        <div className={classes.alignRow}>
          <div className={classes.gutter} aria-hidden="true">
            <span className={classes.gutterTop}>note</span>
            <span className={classes.gutterZero}>± 12-EDO (c)</span>
            <span className={classes.gutterSteps}>step (c)</span>
          </div>
          <div className={classes.plotCol} data-testid="strip-plot">
            <RefLines />
            <div className={classes.stripPlot}>
              <div className={classes.zero} aria-hidden="true" />
              {fieldDevs.map((d, fi) => {
                const sharp = d.dev12 >= 0;
                const active = on.has(fi);
                const lit = active && LIT_FIELD.has(fi);
                return (
                  <div
                    key={fi}
                    className={classes.col}
                    style={{ left: stripLeft(d.c), '--d': Math.abs(d.dev12) } as CSSProperties}
                    data-ratio={d.ratio}
                    data-lit={lit}
                    data-on={active}
                    data-pin={lab.pin === fi}
                    role="button"
                    tabIndex={0}
                    aria-label={`${d.ratio}, ${signed(d.dev12)} cents from ${d.label12}${active ? '' : ', not in the subset'}${lit ? ', sounding' : ''}`}
                    onMouseEnter={() => lab.setHover(fi)}
                    onMouseLeave={() => lab.setHover(null)}
                    onFocus={() => lab.setHover(fi)}
                    onBlur={() => lab.setHover(null)}
                    onClick={() => lab.setPin(lab.pin === fi ? null : fi)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        lab.setPin(lab.pin === fi ? null : fi);
                      }
                    }}
                  >
                    <span className={classes.colRatio}>{d.ratio}</span>
                    <span className={classes.colDot} data-lit={lit} aria-hidden="true" />
                    <span
                      className={classes.colBar}
                      data-dir={sharp ? 'sharp' : 'flat'}
                      aria-hidden="true"
                    />
                    <span className={classes.colNum} data-dir={sharp ? 'sharp' : 'flat'}>
                      {signed(d.dev12)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className={classes.stepRow} aria-label="Scale steps">
              {rel.map((n, i) => {
                const next = i < rel.length - 1 ? rel[i + 1].c : repC;
                return (
                  <span
                    key={i}
                    className={classes.stepCell}
                    style={{ left: stripLeft((n.c + next) / 2) }}
                    title={`Step ${analysis.stepLetters[i]}: ${analysis.steps[i].toFixed(2)} c`}
                  >
                    <Num>{analysis.stepLetters[i]}</Num>
                    <Num muted>{analysis.steps[i].toFixed(1)}</Num>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
