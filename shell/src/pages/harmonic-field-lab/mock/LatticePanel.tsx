/** Lattice panel: the prime lattice of the field; lit notes and the highlighted chord show here too. */
import { Checkbox, NativeSelect } from '@mantine/core';
import { LIT_FIELD, lattice } from './mockData';
import { Num, Row, Strip, Tip, useLab } from './ui';
import classes from './panels.module.css';

export function LatticePanel() {
  const lab = useLab();
  const at = new Map(lattice.pts.map((p) => [p.i, p]));
  // crop the view to the points so the lattice fills the panel
  const xs = lattice.pts.map((p) => p.x);
  const ys = lattice.pts.map((p) => p.y);
  const x0 = Math.min(...xs) - 30;
  const y0 = Math.min(...ys) - 28;
  const box = `${x0} ${y0} ${Math.max(...xs) + 40 - x0} ${Math.max(...ys) + 34 - y0}`;
  return (
    <>
      <Strip title={<Tip k="lattice">Lattice</Tip>}>
        <Tip k="latticeAxes" as="control">
          <NativeSelect
            size="xs"
            aria-label="Axes"
            data={['Auto', 'Generators', 'Factors (CPS)', 'Primes']}
            defaultValue="Primes"
            w={110}
          />
        </Tip>
        <Checkbox size="xs" defaultChecked label="Ratios" />
      </Strip>
      <div className={classes.panelBody}>
        <svg
          viewBox={box}
          className={classes.latticeSvg}
          role="group"
          aria-label="Lattice of the field, notes placed by prime exponents"
        >
          {lattice.edges.map(([a, b], j) => {
            const pa = at.get(a);
            const pb = at.get(b);
            if (!pa || !pb) {
              return null;
            }
            const chord = lab.chord.has(a) && lab.chord.has(b);
            const both = pa.on && pb.on;
            return (
              <line
                key={j}
                className={chord ? classes.edgeChord : both ? classes.edgeOn : classes.edgeOff}
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
              />
            );
          })}
          {lattice.pts.map((p) => {
            const lit = LIT_FIELD.has(p.i);
            const shown = lab.hover ?? lab.pin;
            return (
              <g key={p.i}>
                {shown === p.i && <circle className={classes.selRing} cx={p.x} cy={p.y} r={13} />}
                <circle
                  className={lit ? classes.dotLit : p.on ? classes.dotOn : classes.dotOff}
                  data-chord={lab.chord.has(p.i) ? 'true' : undefined}
                  cx={p.x}
                  cy={p.y}
                  r={lit ? 9 : 6}
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.label}${p.on ? ', in subset' : ''}${lit ? ', sounding' : ''}`}
                  onMouseEnter={() => lab.setHover(p.i)}
                  onMouseLeave={() => lab.setHover(null)}
                  onFocus={() => lab.setHover(p.i)}
                  onBlur={() => lab.setHover(null)}
                  onClick={() => lab.setPin(lab.pin === p.i ? null : p.i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      lab.setPin(lab.pin === p.i ? null : p.i);
                    }
                  }}
                />
                <text
                  className={classes.svgLabel}
                  data-on={p.on}
                  x={p.x + 10}
                  y={p.on ? p.y - 10 : p.y + 20}
                >
                  {p.label}
                </text>
              </g>
            );
          })}
        </svg>
        <div className={classes.verdicts}>
          <Row name="Axes">
            primes <Num>{lattice.axes.join(', ')}</Num>
          </Row>
          <Row name="Notes">
            <Num>{lattice.pts.length}</Num> placed; the factor 2 is folded into the repeat
          </Row>
        </div>
      </div>
    </>
  );
}
