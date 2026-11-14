/**
 * Tuner strip: the field notes by pitch with their sharp/flat bars and the scale steps right under them. Faint
 * vertical reference lines mark every 100 c (1/1 as C): lighter for a white key, darker for a black key. The strip and
 * the saved-subset rows share one gutter and one cents scale (`stripLeft`), so a note is in the same column everywhere.
 */
import { NativeSelect } from '@mantine/core';
import type { CmpRef } from '../state/labState';
import { NoteMark } from './NoteMark';
import { CommitNumber, Num, Strip, Tip, noteHandlers, signed, useLab } from './ui';
import classes from './lab.module.css';

const PAD = 4;
/** Horizontal position (percent of the plot width) of a pitch in cents above 1/1: the one scale every strip uses. */
export const stripLeft = (c: number, repC: number) =>
  `${PAD + (c / (repC > 0 ? repC : 1200)) * (100 - 2 * PAD)}%`;
const BLACK = new Set([1, 3, 6, 8, 10]);
/** Strip plot height and the middle of each note line, in px (match `--mid` and `.stripPlot` in the CSS). */
const MARK_H = 96;
const MARK_MID = 54;
const MARK_HALF = 24;

const GUTTER_ZERO: Record<CmpRef, (m: number) => string> = {
  edo12: () => '± 12-EDO (c)',
  picked: () => '± scale (c)',
  ji: () => '± JI (c)',
  medo: (m) => `± ${m}-EDO (c)`,
};

/** A quiet reference line at every 100 c: absolute 12-EDO pitch (1/1 = C), light for white keys, dark for black. */
export function RefLines({ thin }: { thin?: boolean }) {
  const { base } = useLab();
  const count = Math.min(60, Math.floor(base.repC / 100 + 1e-9) + 1);
  return (
    <div className={classes.refs} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={classes.ref}
          data-black={BLACK.has(i % 12)}
          data-thin={thin ? 'true' : undefined}
          style={{ left: stripLeft(i * 100, base.repC) }}
        />
      ))}
    </div>
  );
}

export function TunerStrip() {
  const lab = useLab();
  const { base, tab, strip, selected, sounding, dispatch } = lab;
  const { rel, repC, analysis } = base;
  const { cmp } = tab;
  return (
    <section className={classes.tuner} aria-label="Tuner strip">
      <Strip title={<Tip k="tunerStrip">Tuner strip</Tip>}>
        <Tip k="compareTo" as="control">
          <NativeSelect
            size="xs"
            aria-label="Compare to"
            data={[
              { value: 'edo12', label: '12-EDO' },
              { value: 'picked', label: 'Picked scale', disabled: !tab.pick.ref },
              { value: 'ji', label: 'JI (odd limit)' },
              { value: 'medo', label: 'm-EDO' },
            ]}
            value={cmp.ref}
            onChange={(e) =>
              dispatch({ type: 'cmp/set', patch: { ref: e.currentTarget.value as CmpRef } })
            }
            w={116}
          />
        </Tip>
        {cmp.ref === 'ji' && (
          <Tip k="oddLimitPick" as="control">
            <CommitNumber
              size="xs"
              aria-label="Odd limit"
              prefix="odd ≤ "
              value={cmp.odd}
              min={1}
              max={255}
              w={78}
              hideControls
              onCommit={(odd) => dispatch({ type: 'cmp/set', patch: { odd } })}
            />
          </Tip>
        )}
        {cmp.ref === 'medo' && (
          <Tip k="compareM" as="control">
            <CommitNumber
              size="xs"
              aria-label="Divisions of the repeat"
              suffix="-EDO"
              value={cmp.m}
              min={1}
              max={1000}
              w={78}
              hideControls
              onCommit={(m) => dispatch({ type: 'cmp/set', patch: { m } })}
            />
          </Tip>
        )}
      </Strip>
      <div className={classes.stripBody}>
        <div className={classes.alignRow}>
          <div className={classes.gutter} aria-hidden="true">
            <span className={classes.gutterTop}>note</span>
            <span className={classes.gutterZero}>{GUTTER_ZERO[cmp.ref](cmp.m)}</span>
            <span className={classes.gutterSteps}>step (c)</span>
          </div>
          <div className={classes.plotCol} data-testid="strip-plot" title={strip.caption}>
            <RefLines />
            <div className={classes.stripPlot}>
              {strip.devs.map((d, fi) => {
                const sharp = d.dev >= 0;
                const active = selected.has(fi);
                const lit = sounding.has(fi);
                return (
                  <div
                    key={fi}
                    className={classes.col}
                    style={{ left: stripLeft(d.c, repC) }}
                    data-ratio={d.ratio}
                    data-lit={lit}
                    data-on={active}
                    data-pin={lab.pin === fi}
                    role="button"
                    tabIndex={0}
                    aria-label={`${d.ratio}, ${signed(d.dev)} cents from ${d.label}${active ? '' : ', not in the subset'}${lab.pin === fi ? ', pinned' : ''}${lit ? ', sounding' : ''}`}
                    onMouseEnter={() => lab.setHover(fi)}
                    onMouseLeave={() => lab.setHover(null)}
                    onFocus={() => lab.setHover(fi)}
                    onBlur={() => lab.setHover(null)}
                    {...noteHandlers(lab, fi)}
                  >
                    <span className={classes.colRatio}>{d.ratio}</span>
                    <NoteMark
                      dev={d.dev}
                      height={MARK_H}
                      mid={MARK_MID}
                      half={MARK_HALF}
                      lit={lit}
                      pinned={lab.pin === fi}
                    />
                    <span className={classes.colNum} data-dir={sharp ? 'sharp' : 'flat'}>
                      {signed(d.dev)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className={classes.stepRow} aria-label="Scale steps">
              {analysis &&
                rel.map((n, i) => {
                  const next = i < rel.length - 1 ? rel[i + 1].c : repC;
                  // in a rotated mode the notes wrap round the repeat: place a step by its position above 1/1
                  const at = (base.rootC + (n.c + next) / 2) % repC;
                  return (
                    <span
                      key={i}
                      className={classes.stepCell}
                      style={{ left: stripLeft(at, repC) }}
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
