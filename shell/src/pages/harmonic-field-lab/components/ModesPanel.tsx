/**
 * Modes panel: one row per mode, a label column and a tile area. The tile area wraps in a narrow panel, and the degree
 * numbers sit in a tile area of their own with the same grid, so every wrapped line of tiles starts at the same column
 * as the line above (never under the label).
 */
import { MAX_KEYS_NOTES, MAX_MODES } from '../state/derive';
import { Num, SEV_LABEL, Strip, Tip, severity, useLab } from './ui';
import classes from './panels.module.css';

const SEV_NAMES = ['exact', '< 5 c', '5-15 c', '15-30 c', '30+ c'];

export function ModesPanel() {
  const lab = useLab();
  const { an, base } = lab;
  const tol = lab.state.ui.tol;
  if (!an.keys) {
    return (
      <>
        <Strip title={<Tip k="modes">Modes</Tip>} />
        <div className={classes.panelBody}>
          <span className={classes.hint} role="status">
            {base.rel.length === 0
              ? 'Select notes to see their modes.'
              : `Modes are worked out for subsets of up to ${MAX_KEYS_NOTES} notes in a field this size. Select fewer notes.`}
          </span>
        </div>
      </>
    );
  }
  const { modeFit } = an.keys;
  const N = modeFit.length;
  return (
    <>
      <Strip title={<Tip k="modes">Modes</Tip>} />
      <div className={classes.panelBody}>
        <span className={classes.legend} aria-label="Heat grid legend">
          {SEV_NAMES.map((n, i) => (
            <span key={n} className={classes.legendItem}>
              <span className={classes.swatch} data-sev={i} aria-hidden="true" />
              {n}
            </span>
          ))}
        </span>
        <h3 className={classes.familyHead}>
          <Tip k="modes">Mode grid</Tip>
          <Num muted>
            {N} rows &times; {N} degrees
          </Num>
        </h3>
        {N === 0 && (
          <span className={classes.hint} role="status">
            The mode grid is shown for up to {MAX_MODES} notes.
          </span>
        )}
        <div className={classes.heat} role="group" aria-label="Mode by degree heat grid">
          <div
            className={`${classes.modeLine} ${classes.modeHead}`}
            aria-hidden="true"
            data-testid="mode-head"
          >
            <span className={classes.modeLabelCol} />
            <span className={classes.modeTiles} data-testid="mode-tiles">
              {(modeFit[0]?.errs ?? []).map((_, j) => (
                <span key={j} className={classes.modeHeadCell}>
                  <Num muted>{j}</Num>
                </span>
              ))}
            </span>
            <span className={classes.modeTotalCol} />
          </div>
          {modeFit.map((m) => {
            const worst = Math.max(...m.errs);
            const label = `Mode ${m.mode}, root ${m.root}: ${m.ok} of ${N} degrees land within ${tol} c of a field note; worst ${worst.toFixed(1)} c`;
            return (
              <button
                key={m.mode}
                type="button"
                className={`${classes.modeLine} ${classes.heatRowBtn}`}
                data-testid="mode-row"
                aria-pressed={lab.mode === m.mode}
                aria-label={label}
                title={label}
                onClick={() => lab.setMode(m.mode)}
              >
                <span className={`${classes.modeLabelCol} ${classes.heatName}`}>
                  <Num muted>{m.mode}</Num> <Num>{m.root}</Num>
                </span>
                <span className={classes.modeTiles} data-testid="mode-tiles">
                  {m.errs.map((e, j) => (
                    <span
                      key={j}
                      className={classes.heatCell}
                      data-sev={severity(e)}
                      title={`Degree ${j}: ${e < 1e-6 ? 'exact' : `${e.toFixed(1)} c`} from the nearest field note (${SEV_LABEL[severity(e)]})`}
                    >
                      <Num>{e < 1e-6 ? '0' : e.toFixed(0)}</Num>
                    </span>
                  ))}
                </span>
                <span className={`${classes.modeTotalCol} ${classes.heatTotal}`}>
                  <Num muted>
                    {m.ok}/{N}
                  </Num>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
