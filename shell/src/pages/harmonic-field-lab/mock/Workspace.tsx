/** The centre: generation and selection in one unit (generator bar, circle + stats, subset tools, tuner strip). */
import { GeneratorBar } from './GeneratorBar';
import { Inspector, PitchRing, Stats } from './RingStats';
import { SubsetRow } from './SubsetRow';
import { TunerStrip } from './TunerStrip';
import { Tip } from './ui';
import classes from './mock.module.css';

export function Workspace() {
  return (
    <section className={classes.workspace} aria-label="Generator and subset">
      <GeneratorBar />
      <div className={classes.ringArea}>
        <div className={classes.ringBox}>
          <span className={classes.ringCap}>
            <Tip k="pitchCircle">Pitch circle</Tip>
          </span>
          <PitchRing />
        </div>
        <Stats />
      </div>
      <Inspector />
      <SubsetRow />
      <TunerStrip />
    </section>
  );
}
