/** The centre: generation and selection in one unit (generator bar, circle + stats, subset tools, strip, saved). */
import { GeneratorColumn } from './GeneratorColumn';
import { RingPanel, Stats } from './RingStats';
import { SavedSubsets } from './SavedSubsets';
import { SubsetRow } from './SubsetRow';
import { TunerStrip } from './TunerStrip';
import classes from './mock.module.css';

export function Workspace() {
  return (
    <section className={classes.workspace} aria-label="Generator and subset">
      <div className={classes.ringArea}>
        <GeneratorColumn />
        <RingPanel />
        <Stats />
      </div>
      <SubsetRow />
      <TunerStrip />
      <SavedSubsets />
    </section>
  );
}
