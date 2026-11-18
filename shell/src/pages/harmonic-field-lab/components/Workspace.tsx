/**
 * The center: generation and selection in one unit. A grid so the pieces can regroup when it narrows:
 * parameter column | ring | stats; under the ring and stats the note-selection bar (select stack and mode under the
 * ring, nearest scale and odd limit under the stats); then the strip and saved list on the left
 * with the shape stats and step-size bars beside them.
 */
import { useState } from 'react';
import { GeneratorColumn } from './GeneratorColumn';
import { ProductOpenContext, ProductPanel } from './ProductDialog';
import { RingPanel, ShapeStats, Stats } from './RingStats';
import { SavedSubsets } from './SavedSubsets';
import { SubsetRow } from './SubsetRow';
import { TunerStrip } from './TunerStrip';
import classes from './lab.module.css';

export function Workspace() {
  // the product module (M8g) is its own grid area under the tools row; the subset row's button toggles it
  const [productOpen, setProductOpen] = useState(false);
  return (
    <ProductOpenContext.Provider value={{ open: productOpen, setOpen: setProductOpen }}>
      <section
        className={classes.workspace}
        aria-label="Generator and subset"
        data-product={productOpen || undefined}
      >
        <div className={classes.areaGen}>
          <GeneratorColumn />
        </div>
        <div className={classes.areaRing}>
          <RingPanel />
        </div>
        <div className={classes.areaStats}>
          <Stats />
        </div>
        <div className={classes.areaTools}>
          <SubsetRow />
        </div>
        {productOpen && (
          <div className={classes.areaProduct}>
            <ProductPanel onClose={() => setProductOpen(false)} />
          </div>
        )}
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
    </ProductOpenContext.Provider>
  );
}
