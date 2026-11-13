/** Spectrum panel: every generic interval with the sizes it takes (wrapped chips), plus the propriety clashes. */
import { cs, prop, spectrum } from './mockData';
import { Num, Row, Strip, Tip } from './ui';
import classes from './panels.module.css';

const ordinal = (n: number) =>
  n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

export function SpectrumPanel() {
  const byK = new Map<number, { a: number; b: number }[]>();
  for (const p of prop.pairs) {
    byK.set(p.k, [...(byK.get(p.k) ?? []), p]);
  }
  return (
    <>
      <Strip title={<Tip k="spectrum">Interval spectrum</Tip>} />
      <div className={classes.panelBody}>
        <div className={classes.verdicts}>
          <Row name={<Tip k="propriety">Propriety</Tip>}>
            {prop.verdict} (<Num>{prop.pairs.length}</Num> clashes)
          </Row>
          <Row name={<Tip k="constantStructure">Constant structure</Tip>}>
            {cs.cs
              ? 'yes'
              : `no: ${cs.example?.size.toFixed(2)} c is a ${ordinal((cs.example?.ks[0] ?? 0) + 1)} and a ${ordinal((cs.example?.ks[1] ?? 0) + 1)}`}
          </Row>
        </div>
        <table className={classes.spec}>
          <thead>
            <tr>
              <th>Interval</th>
              <th>
                <Tip k="variety">Sizes</Tip>
              </th>
              <th>Sizes (c) and how often</th>
            </tr>
          </thead>
          <tbody>
            {spectrum.map((r) => (
              <tr key={r.k}>
                <td>{ordinal(r.k + 1)}</td>
                <td>
                  <Num>{r.variety}</Num>
                </td>
                <td>
                  <span className={classes.sizeChips}>
                    {r.sizes.map((s) => (
                      <span key={s.size} className={classes.sizeChip}>
                        <Num>{s.size.toFixed(1)}</Num>
                        {s.count > 1 && <Num muted> &times;{s.count}</Num>}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <section className={classes.family} aria-label="Propriety clashes">
          <h3 className={classes.familyHead}>Propriety clashes (k-step wider than k+1)</h3>
          {[...byK].map(([k, ps]) => (
            <div key={k} className={classes.clash}>
              <span className={classes.clashName}>
                {ordinal(k + 1)} &gt; {ordinal(k + 2)}
              </span>
              <span className={classes.sizeChips}>
                {ps.map((p, i) => (
                  <span key={i} className={classes.sizeChip}>
                    <Num>
                      {p.a.toFixed(1)} &gt; {p.b.toFixed(1)}
                    </Num>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
