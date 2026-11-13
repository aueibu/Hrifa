/** Saved subsets of this pitch collection: one mini tuner strip (a sparkline) per row. Hover previews, click loads. */
import type { CSSProperties } from 'react';
import { ActionIcon } from '@mantine/core';
import { fmtRatio } from '../../../lib/harmonic-field';
import { SaveIcon } from './icons';
import { field, fieldDev12, savedSubsets } from './mockData';
import { NoteMark } from './NoteMark';
import { RefLines, stripLeft } from './TunerStrip';
import { Num, Strip, Tip, useLab } from './ui';
import classes from './mock.module.css';

const fieldRatio = field.map((n) => fmtRatio(n));

export function SavedSubsets() {
  const lab = useLab();
  return (
    <section className={classes.saved} aria-label="Saved subsets">
      <Strip title={<Tip k="savedSubsets">Saved subsets</Tip>}>
        <Num muted>{savedSubsets.length}</Num>
        <Tip k="saveSubset" as="control">
          <ActionIcon variant="default" size="sm" aria-label="Save current subset">
            <SaveIcon />
          </ActionIcon>
        </Tip>
      </Strip>
      <ul className={classes.savedList} aria-label="Saved subsets list">
        {savedSubsets.map((s, k) => {
          const on = new Set(s.idx);
          return (
            <li key={s.name}>
              <Tip k="savedRow" as="control" block>
                <button
                  type="button"
                  className={classes.savedRow}
                  aria-pressed={lab.loaded === k}
                  aria-label={`${s.name}: ${s.idx.length} of ${field.length} notes. Click to load.`}
                  onMouseEnter={() => lab.setPreview(s.idx)}
                  onMouseLeave={() => lab.setPreview(null)}
                  onFocus={() => lab.setPreview(s.idx)}
                  onBlur={() => lab.setPreview(null)}
                  onClick={() => lab.setLoaded(k)}
                >
                  <span className={classes.savedName}>
                    <span>{s.name}</span>
                    <Num muted>
                      {s.idx.length} notes
                      {s.primeLimit ? ` · ${s.primeLimit}-limit` : ''}
                    </Num>
                  </span>
                  <span className={classes.spark} aria-hidden="true">
                    <RefLines thin />
                    {field.map((n, i) => (
                      <span
                        key={i}
                        className={classes.sparkCol}
                        data-on={on.has(i)}
                        data-ratio={fieldRatio[i]}
                        data-dir={fieldDev12[i] >= 0 ? 'sharp' : 'flat'}
                        style={
                          { left: stripLeft(n.c), '--d': Math.abs(fieldDev12[i]) } as CSSProperties
                        }
                      >
                        <NoteMark
                          dev={fieldDev12[i]}
                          height={30}
                          mid={15}
                          half={4}
                          scale={0.2}
                          showError={on.has(i)}
                        />
                      </span>
                    ))}
                  </span>
                </button>
              </Tip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
