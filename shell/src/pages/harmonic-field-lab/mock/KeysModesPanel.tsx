/** Keys & Modes panel: one mode x degree heat grid, and one mini ring per key showing which transpositions fit. */
import { chordTolerance, completeKeys, field, keyRings, modeFit, repC } from './mockData';
import { Num, SEV_LABEL, Strip, Tip, severity, useLab } from './ui';
import classes from './panels.module.css';

const N = modeFit.length;
const SEV_NAMES = ['exact', '< 5 c', '5-15 c', '15-30 c', '30+ c'];

function KeyRing({ k }: { k: (typeof keyRings)[number] }) {
  const S = 56;
  const C = S / 2;
  const R = 20;
  const at = (c: number, r = R) => {
    const a = (c / repC) * 2 * Math.PI - Math.PI / 2;
    return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
  };
  const label = k.complete
    ? `Key on ${k.root}: the whole scale fits`
    : `Key on ${k.root}: ${k.missing} scale note${k.missing === 1 ? '' : 's'} missing from the field`;
  return (
    <li className={classes.keyRing} data-complete={k.complete} title={label}>
      <svg viewBox={`0 0 ${S} ${S}`} className={classes.keySvg} role="img" aria-label={label}>
        <circle className={classes.keyCircle} cx={C} cy={C} r={R} />
        {field.map((n, i) => {
          const p = at(n.c);
          return <circle key={i} className={classes.keyField} cx={p.x} cy={p.y} r={2} />;
        })}
        {k.moved.map((m, d) => {
          const p = at(m.c, R + 0.5);
          return m.found ? (
            <circle key={d} className={classes.keyFound} cx={p.x} cy={p.y} r={3.2} />
          ) : (
            <path
              key={d}
              className={classes.keyMiss}
              d={`M${p.x - 2.6} ${p.y - 2.6}l5.2 5.2M${p.x + 2.6} ${p.y - 2.6}l-5.2 5.2`}
            />
          );
        })}
      </svg>
      <Num>{k.root}</Num>
      <Num muted>{k.complete ? 'fits' : `−${k.missing}`}</Num>
    </li>
  );
}

export function KeysModesPanel() {
  const lab = useLab();
  return (
    <>
      <Strip title={<Tip k="keysModes">Keys &amp; Modes</Tip>} />
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
          <Tip k="modes">Modes</Tip>
          <Num muted>
            {N} rows &times; {N} degrees
          </Num>
        </h3>
        <div className={classes.heat} role="group" aria-label="Mode by degree heat grid">
          <div className={classes.heatHead} aria-hidden="true">
            <span />
            {modeFit[0].errs.map((_, j) => (
              <span key={j}>
                <Num muted>{j}</Num>
              </span>
            ))}
            <span />
          </div>
          {modeFit.map((m) => {
            const worst = Math.max(...m.errs);
            const label = `Mode ${m.mode}, root ${m.root}: ${m.ok} of ${N} degrees land within ${chordTolerance} c of a field note; worst ${worst.toFixed(1)} c`;
            return (
              <button
                key={m.mode}
                type="button"
                className={classes.heatRow}
                aria-pressed={lab.mode === m.mode}
                aria-label={label}
                title={label}
                onClick={() => lab.setMode(m.mode)}
              >
                <span className={classes.heatName}>
                  <Num muted>{m.mode}</Num> <Num>{m.root}</Num>
                </span>
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
                <span className={classes.heatTotal}>
                  <Num muted>
                    {m.ok}/{N}
                  </Num>
                </span>
              </button>
            );
          })}
        </div>
        <h3 className={classes.familyHead}>
          <Tip k="keyRings">Keys</Tip>
          <Num muted>
            {completeKeys.length} of {field.length} complete
          </Num>
        </h3>
        <ul className={classes.keyRings} aria-label="Keys">
          {keyRings.map((k) => (
            <KeyRing key={k.rootIdx} k={k} />
          ))}
        </ul>
      </div>
    </>
  );
}
