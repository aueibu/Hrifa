/**
 * Modes panel: one row per mode, a label column and a tile area. The tile area wraps in a narrow panel, and the degree
 * numbers sit in a tile area of their own with the same grid, so every wrapped line of tiles starts at the same column
 * as the line above (never under the label).
 */
import { useState, type MouseEvent } from 'react';
import { ActionIcon, Modal } from '@mantine/core';
import { MAX_KEYS_NOTES, MAX_MODES } from '../state/derive';
import { useLabDeveloperOptions } from '../state/developerOptions';
import { sevTileStyle } from '../state/tileColors';
import { ExpandIcon } from './icons';
import {
  Num,
  SEV_LABEL,
  Strip,
  Tip,
  previewKind,
  signChar,
  signedCents,
  severity,
  useLab,
  Hint,
} from './ui';
import { useTiles } from './useTiles';
import classes from './panels.module.css';

const SEV_NAMES = ['exact', '< 5 c', '5-15 c', '15-30 c', '30+c'];

/** The heat grid, its legend and the empty-state messages: the same component in the panel and in the large window. */
function ModesBody({ big }: { big?: boolean }) {
  const lab = useLab();
  const { an, base } = lab;
  const tol = lab.state.ui.tol;
  const [dev] = useLabDeveloperOptions();
  const tiles = useTiles();
  if (!an.keys) {
    return (
      <span className={classes.hint} role="status">
        {base.rel.length === 0
          ? 'Select notes to see their modes.'
          : `Modes are worked out for subsets of up to ${MAX_KEYS_NOTES} notes in a field this size. Select fewer notes.`}
      </span>
    );
  }
  const { modeFit } = an.keys;
  const N = modeFit.length;
  /** Ctrl/Cmd, Shift or both on a title or a tile: hear it, and leave the row's own click (select the mode) alone. */
  const preview = (e: MouseEvent, mode: number, degree?: number) => {
    const kind = previewKind(e);
    if (kind) {
      e.stopPropagation();
      lab.audio.playModePreview(mode, kind, degree);
    }
  };
  return (
    <>
      <div className={`${classes.modesBody} ${big ? classes.modesBig : ''}`}>
        <span className={classes.legend} aria-label="Heat grid legend">
          {SEV_NAMES.map((n, i) => (
            <span key={n} className={classes.legendItem}>
              <span
                className={classes.swatch}
                data-sev={i}
                data-tile={tiles.look}
                style={sevTileStyle(tiles.look, tiles.outline, i, tiles.scheme)}
                aria-hidden="true"
              />
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
        <div
          className={classes.heat}
          role="group"
          aria-label="Mode by degree heat grid"
          data-signs={dev.modeSignAlways ? 'always' : 'hover'}
        >
          <div
            className={`${classes.modeLine} ${classes.modeHead}`}
            aria-hidden="true"
            data-testid="mode-head"
          >
            <span className={classes.modeLabelCol} />
            <span className={classes.modeTiles} data-testid="mode-tiles">
              {(modeFit[0]?.errs ?? []).map((_, j) => (
                <span key={j} className={classes.modeHeadCell}>
                  <Num muted>{j + 1}</Num>
                </span>
              ))}
            </span>
            <span className={classes.modeTotalCol} />
          </div>
          {modeFit.map((m) => {
            const worst = Math.max(...m.errs);
            const label = `Mode ${m.mode + 1}, root ${m.root}: ${m.ok} of ${N} degrees land within ${tol} c of a field note; worst ${worst.toFixed(1)} c`;
            return (
              <Hint key={m.mode} dynamic={label}>
                <button
                  type="button"
                  className={`${classes.modeLine} ${classes.heatRowBtn}`}
                  data-testid="mode-row"
                  aria-pressed={lab.mode === m.mode}
                  aria-label={label}
                  onClick={() => lab.setMode(m.mode)}
                  onFocus={() => lab.audio.setPreviewTarget({ kind: 'mode', mode: m.mode })}
                  onBlur={() => lab.audio.clearPreviewTarget({ kind: 'mode', mode: m.mode })}
                >
                  <span
                    className={`${classes.modeLabelCol} ${classes.heatName}`}
                    data-testid="mode-title"
                    onClick={(e) => preview(e, m.mode)}
                    onMouseEnter={() => lab.audio.setPreviewTarget({ kind: 'mode', mode: m.mode })}
                    onMouseLeave={() =>
                      lab.audio.clearPreviewTarget({ kind: 'mode', mode: m.mode })
                    }
                  >
                    <Num muted>{m.mode + 1}</Num> <Num>{m.root}</Num>
                  </span>
                  <span className={classes.modeTiles} data-testid="mode-tiles">
                    {m.errs.map((e, j) => {
                      const sg = m.signed[j];
                      const sign = signChar(sg);
                      const word = sign === '+' ? ' (sharp)' : sign ? ' (flat)' : '';
                      const tip = `Degree ${j + 1}: ${sign ? `${signedCents(sg)}${word}` : 'exact'} from the nearest field note (${SEV_LABEL[severity(e)]})`;
                      return (
                        <Hint key={j} dynamic={tip}>
                          <span
                            className={classes.heatCell}
                            data-sev={severity(e)}
                            data-tile={tiles.look}
                            style={sevTileStyle(
                              tiles.look,
                              tiles.outline,
                              severity(e),
                              tiles.scheme
                            )}
                            data-sign={sign}
                            role="img"
                            aria-label={tip}
                            data-testid="mode-tile"
                            onClick={(e) => preview(e, m.mode, j)}
                            onMouseEnter={() =>
                              lab.audio.setPreviewTarget({ kind: 'tile', mode: m.mode, degree: j })
                            }
                            onMouseLeave={() =>
                              lab.audio.clearPreviewTarget({
                                kind: 'tile',
                                mode: m.mode,
                                degree: j,
                              })
                            }
                          >
                            <span className={classes.heatSign} aria-hidden="true">
                              {sign}
                            </span>
                            <span className={classes.heatNum} aria-hidden="true">
                              <Num>
                                {sign}
                                {e < 1e-6 ? '0' : e.toFixed(0)}
                              </Num>
                            </span>
                          </span>
                        </Hint>
                      );
                    })}
                  </span>
                  <span className={`${classes.modeTotalCol} ${classes.heatTotal}`}>
                    <Num muted>
                      {m.ok}/{N}
                    </Num>
                  </span>
                </button>
              </Hint>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** The Modes panel: the heat grid; a large window shows the same grid with bigger tiles and text. */
export function ModesPanel() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Strip title={<Tip k="modes">Modes</Tip>}>
        <Tip k="modesPopOut" as="control">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="Open Modes in a large window"
            onClick={() => setOpen(true)}
          >
            <ExpandIcon />
          </ActionIcon>
        </Tip>
      </Strip>
      <div className={classes.panelBody}>
        <ModesBody />
      </div>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title="Modes"
        size="min(64rem, 94vw)"
        transitionProps={{ duration: 0 }}
      >
        <div className={classes.vizModal}>
          <ModesBody big />
        </div>
      </Modal>
    </>
  );
}
