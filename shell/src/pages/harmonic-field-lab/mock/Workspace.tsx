/**
 * The centre: generation and selection in one unit. A grid so the pieces can regroup when it narrows:
 * parameter column (with the subset tools under it) | ring | stats, then the strip and saved list on the left
 * with the shape stats and step-size bars beside them.
 */
import { GeneratorColumn } from './GeneratorColumn';
import { RingPanel, ShapeStats, Stats } from './RingStats';
import { SavedSubsets } from './SavedSubsets';
import { SubsetRow } from './SubsetRow';
import { TunerStrip } from './TunerStrip';
import classes from './mock.module.css';

export function Workspace() {
  return (
    <section className={classes.workspace} aria-label="Generator and subset">
      <div className={classes.areaGen}>
        <GeneratorColumn />
        <SubsetRow />
      </div>
      <div className={classes.areaRing}>
        <RingPanel />
      </div>
      <div className={classes.areaStats}>
        <Stats />
      </div>
      <div className={classes.areaStrip}>
        <TunerStrip />
      </div>
      <div className={classes.areaSaved}>
        <SavedSubsets />
      </div>
      <div className={classes.areaSide}>
        <ShapeStats />
      </div>
    </section>
  );
}
