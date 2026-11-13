/** Chords panel: tolerance with a ladder; sections by note count, one row per family, one chip per voicing. */
import { useState } from 'react';
import { ActionIcon, Button, Modal, TextInput, Tooltip } from '@mantine/core';
import { DEFAULT_TEMPLATES } from '../../../lib/harmonic-field';
import { MinusIcon, PlusIcon, TrashIcon } from './icons';
import {
  LIT_FIELD,
  SIZES,
  chipsAt,
  chordsAt,
  familyOrder,
  ladder,
  templateCount,
  type ChordChip,
} from './mockData';
import { Num, SEV_LABEL, Strip, Tip, severity, useLab } from './ui';
import classes from './panels.module.css';

function Chip({ chip, onRaise }: { chip: ChordChip; onRaise: (tol: number) => void }) {
  const lab = useLab();
  const sev = severity(chip.maxErr);
  const need = Math.ceil(chip.needs - 1e-9);
  const err = chip.maxErr < 1e-6 ? 'none (exact)' : `${chip.maxErr.toFixed(1)} c`;
  const label = chip.found
    ? `${chip.name} ${chip.template} on ${chip.root}: notes ${chip.members.join(' ')}. Largest error ${err}.`
    : `${chip.name} ${chip.template} would sit on ${chip.root} (notes ${chip.members.join(' ')}) but needs ${need} c of tolerance. Click to raise the tolerance to ${need} c.`;
  return (
    <Tooltip label={label} multiline w={260} openDelay={250}>
      <button
        type="button"
        className={classes.chip}
        data-found={chip.found}
        aria-label={label}
        onMouseEnter={() => lab.setChord(new Set(chip.memberIdx))}
        onMouseLeave={() => lab.setChord(LIT_FIELD)}
        onFocus={() => lab.setChord(new Set(chip.memberIdx))}
        onBlur={() => lab.setChord(LIT_FIELD)}
        onClick={() => {
          if (!chip.found) {
            onRaise(need);
          }
        }}
      >
        <span className={classes.chipTop}>
          <Num>{chip.template}</Num>
          <Num muted>@ {chip.root}</Num>
        </span>
        <span className={classes.chipBottom}>
          <Num muted>{chip.members.join(' ')}</Num>
          {chip.found ? (
            <span className={classes.err} data-sev={sev} title={`Error ${SEV_LABEL[sev]}`}>
              <Num>{sev === 0 ? 'exact' : chip.maxErr.toFixed(1)}</Num>
            </span>
          ) : (
            <span className={classes.need}>
              <Num>+{need} c</Num>
            </span>
          )}
        </span>
      </button>
    </Tooltip>
  );
}

function TemplateEditor() {
  const [rows, setRows] = useState(() => DEFAULT_TEMPLATES.map((t) => ({ ...t })));
  return (
    <div className={classes.editor}>
      <div className={classes.editorRow} aria-hidden="true">
        <span className={classes.hint}>Name</span>
        <span className={classes.hint}>Ratios</span>
        <span className={classes.hint}>Family</span>
        <span />
      </div>
      {rows.map((t, i) => (
        <div key={i} className={classes.editorRow}>
          <TextInput size="xs" aria-label={`Template ${i + 1} name`} defaultValue={t.name} />
          <TextInput size="xs" aria-label={`Template ${i + 1} ratios`} defaultValue={t.text} />
          <TextInput
            size="xs"
            aria-label={`Template ${i + 1} family`}
            placeholder="Other"
            defaultValue={t.family}
          />
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={`Remove ${t.name}`}
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
          >
            <TrashIcon />
          </ActionIcon>
        </div>
      ))}
      <div className={classes.editorFoot}>
        <Button
          size="xs"
          variant="default"
          leftSection={<PlusIcon />}
          onClick={() => setRows([...rows, { name: 'new template', text: '4:5:6' }])}
        >
          Add template
        </Button>
        <Button
          size="xs"
          variant="default"
          onClick={() => setRows(DEFAULT_TEMPLATES.map((t) => ({ ...t })))}
        >
          Reset list
        </Button>
      </div>
    </div>
  );
}

export function ChordsPanel({ tol, setTol }: { tol: number; setTol: (t: number) => void }) {
  const [editing, setEditing] = useState(false);
  const count = chordsAt(tol).length;
  const up = ladder.find((r) => r.tol > tol && r.count > count);
  const down = [...ladder].reverse().find((r) => r.tol < tol && r.count < count);
  const current = [...ladder].reverse().find((r) => r.tol <= tol)?.tol;
  const chips = chipsAt(tol);
  const families = familyOrder(chips.map((c) => c.family));
  /** A window of the ladder around the current rung: one below, six above. */
  const at = ladder.findIndex((r) => r.tol === current);
  const shown = ladder.slice(Math.max(0, at - 1), at + 7);
  return (
    <>
      <Strip title={<Tip k="chords">Chords</Tip>}>
        <Tip k="editTemplates" as="control">
          <Button size="compact-xs" variant="default" onClick={() => setEditing(true)}>
            Edit templates
          </Button>
        </Tip>
      </Strip>
      <div className={classes.panelBody}>
        <div className={classes.tolRow}>
          <Tip k="chordTolerance">Tolerance</Tip>
          <ActionIcon
            variant="default"
            size="sm"
            aria-label="Lower tolerance"
            disabled={!down}
            onClick={() => down && setTol(down.tol)}
          >
            <MinusIcon />
          </ActionIcon>
          <span className={classes.tolValue}>
            <Num>{tol} c</Num>
          </span>
          <ActionIcon
            variant="default"
            size="sm"
            aria-label="Raise tolerance"
            disabled={!up}
            onClick={() => up && setTol(up.tol)}
          >
            <PlusIcon />
          </ActionIcon>
          <Tip k="chordLadder">
            <span className={classes.hint} aria-live="polite">
              {up ? (
                <>
                  +<Num>{up.tol - tol}</Num> c &rarr; <Num>{up.count - count}</Num> more
                </>
              ) : (
                'nothing more to find'
              )}
              {down && (
                <>
                  {' '}
                  &middot; &minus;<Num>{tol - down.tol}</Num> c &rarr;{' '}
                  <Num>{count - down.count}</Num> fewer
                </>
              )}
            </span>
          </Tip>
        </div>
        <div className={classes.ladder} role="group" aria-label="Tolerance ladder">
          {shown.map((r) => (
            <button
              key={r.tol}
              type="button"
              className={classes.rung}
              data-on={r.tol === current}
              aria-label={`Tolerance ${r.tol} c, ${r.count} chords`}
              onClick={() => setTol(r.tol)}
            >
              <Num>{r.tol}</Num>
              <Num muted>{r.count}</Num>
            </button>
          ))}
        </div>
        {SIZES.map((size) => {
          const inSize = chips.filter((c) => c.size === size);
          if (!inSize.length) {
            return null;
          }
          return (
            <section key={size} className={classes.family} aria-label={size}>
              <h3 className={classes.familyHead}>
                <Tip k="chordFamily">{size}</Tip>
                <Num muted>{inSize.filter((c) => c.found).length}</Num>
              </h3>
              {families.map((f) => {
                const row = inSize.filter((c) => c.family === f);
                if (!row.length) {
                  return null;
                }
                return (
                  <div key={f} className={classes.famRow} role="group" aria-label={`${size}, ${f}`}>
                    <span className={classes.famLabel}>{f}</span>
                    <div className={classes.chips}>
                      {row.map((c, i) => (
                        <Chip
                          key={`${c.template}-${c.members.join()}-${i}`}
                          chip={c}
                          onRaise={setTol}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
        <span className={classes.foot}>
          <Tip k="templates">Templates</Tip> <Num>{templateCount}</Num>
        </span>
      </div>
      <Modal
        opened={editing}
        onClose={() => setEditing(false)}
        title="Chord templates"
        size="lg"
        transitionProps={{ duration: 0 }}
      >
        <TemplateEditor />
      </Modal>
    </>
  );
}
