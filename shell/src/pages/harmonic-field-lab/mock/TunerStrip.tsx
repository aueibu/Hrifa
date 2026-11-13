/** Tuner strip with the scale degrees rolled in: ratio on top, deviation bar from the target, step letter below. */
import type { CSSProperties } from 'react';
import { NativeSelect, NumberInput } from '@mantine/core';
import { LIT, analysis, devs, rel, repC } from './mockData';
import { Num, Strip, Tip, signed, useLab } from './ui';
import classes from './mock.module.css';

const PAD = 4;
const left = (c: number) => `${PAD + (c / repC) * (100 - 2 * PAD)}%`;

export function TunerStrip() {
  const lab = useLab();
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
        <div className={classes.stripPlot}>
          <div className={classes.zero} aria-hidden="true" />
          {devs.map((d, i) => {
            const sharp = d.dev12 >= 0;
            const lit = LIT.has(i);
            const fi = rel[i].src;
            return (
              <div
                key={i}
                className={classes.col}
                style={{ left: left(d.c), '--d': Math.abs(d.dev12) } as CSSProperties}
                data-lit={lit}
                data-pin={lab.pin === fi}
                role="button"
                tabIndex={0}
                aria-label={`${d.ratio}, ${signed(d.dev12)} cents from ${d.label12}${lit ? ', sounding' : ''}`}
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
                <span className={classes.colDash} aria-hidden="true" />
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
            const mid = (n.c + next) / 2;
            return (
              <span
                key={i}
                className={classes.stepCell}
                style={{ left: left(mid) }}
                title={`Step ${analysis.stepLetters[i]}: ${analysis.steps[i].toFixed(2)} c`}
              >
                <Num>{analysis.stepLetters[i]}</Num>
                <Num muted>{analysis.steps[i].toFixed(1)}</Num>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
