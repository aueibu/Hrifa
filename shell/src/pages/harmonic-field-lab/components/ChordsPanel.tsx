/** Chords panel: tolerance with a ladder; sections by note count, one row per family, one chip per voicing. */
import { useState } from 'react';
import { ActionIcon, Button, Modal, Tooltip } from '@mantine/core';
import { DEFAULT_TEMPLATES, parseTemplate, type ChordTemplate } from '../../../lib/harmonic-field';
import { MAX_CHORDS, SIZES, familyOrder, type ChordChip } from '../state/derive';
import { MAX_TEMPLATES } from '../state/labState';
import { MinusIcon, PlusIcon, TrashIcon } from './icons';
import { DebouncedText, Num, SEV_LABEL, Strip, Tip, severity, useLab } from './ui';
import classes from './panels.module.css';

function Chip({ chip, onRaise }: { chip: ChordChip; onRaise: (tol: number) => void }) {
  const lab = useLab();
  const picked =
    lab.chordPicked !== null &&
    lab.chordPicked.size === chip.memberIdx.length &&
    chip.memberIdx.every((i) => lab.chordPicked?.has(i));
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
        data-picked={picked}
        aria-pressed={chip.found ? picked : undefined}
        onMouseEnter={() => lab.setChord(new Set(chip.memberIdx))}
        onMouseLeave={() => lab.setChord(null)}
        onFocus={() => lab.setChord(new Set(chip.memberIdx))}
        onBlur={() => lab.setChord(null)}
        onClick={() => {
          if (!chip.found) {
            onRaise(need);
          } else if (picked) {
            lab.pickChord(null);
          } else {
            lab.pickChord(new Set(chip.memberIdx));
            lab.audio.playFieldChord(chip.memberIdx);
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
  const { state, dispatch } = useLab();
  const rows = state.templates;
  // bumped when a cleared ratios box is put back, so the box shows the kept text again
  const [rev, setRev] = useState(0);
  const set = (templates: ChordTemplate[]) => dispatch({ type: 'templates/set', templates });
  const patch = (i: number, p: Partial<ChordTemplate>) =>
    set(rows.map((t, j) => (j === i ? { ...t, ...p } : t)));
  return (
    <div className={classes.editor}>
      <div className={classes.editorRow}>
        <Tip k="templateName">Name</Tip>
        <Tip k="templateRatios">Ratios</Tip>
        <Tip k="templateFamily">Family</Tip>
        <span />
      </div>
      {rows.map((t, i) => {
        const parsed = parseTemplate(t.text);
        return (
          <div key={i} className={classes.editorRow}>
            <DebouncedText
              size="xs"
              aria-label={`Template ${i + 1} name`}
              value={t.name ?? ''}
              onCommit={(v) => patch(i, { name: v.trim() || undefined })}
            />
            <DebouncedText
              key={`ratios-${rev}`}
              size="xs"
              aria-label={`Template ${i + 1} ratios`}
              value={t.text}
              error={parsed.ok ? undefined : parsed.error}
              onCommit={(v) => (v.trim() ? patch(i, { text: v }) : setRev((n) => n + 1))}
            />
            <DebouncedText
              size="xs"
              aria-label={`Template ${i + 1} family`}
              placeholder="Other"
              value={t.family ?? ''}
              onCommit={(v) => patch(i, { family: v.trim() || undefined })}
            />
            <Tip k="templateRemove" as="control">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`Remove ${t.name ?? t.text}`}
                onClick={() => set(rows.filter((_, j) => j !== i))}
              >
                <TrashIcon />
              </ActionIcon>
            </Tip>
          </div>
        );
      })}
      <div className={classes.editorFoot}>
        <Tip k="templateAdd" as="control">
          <Button
            size="xs"
            variant="default"
            leftSection={<PlusIcon />}
            disabled={rows.length >= MAX_TEMPLATES}
            onClick={() => set([...rows, { name: 'new template', text: '4:5:6' }])}
          >
            Add template
          </Button>
        </Tip>
        <Tip k="templateReset" as="control">
          <Button
            size="xs"
            variant="default"
            onClick={() => set(DEFAULT_TEMPLATES.map((t) => ({ ...t })))}
          >
            Reset list
          </Button>
        </Tip>
      </div>
    </div>
  );
}

export function ChordsPanel() {
  const { an, state, dispatch } = useLab();
  const [editing, setEditing] = useState(false);
  const model = an.chords;
  const tol = state.ui.tol;
  const setTol = (t: number) => dispatch({ type: 'ui', patch: { tol: t } });
  const ladder = model?.ladder ?? [];
  const count = model ? model.chordsAt(tol).length : 0;
  const up = ladder.find((r) => r.tol > tol && r.count > count);
  const down = [...ladder].reverse().find((r) => r.tol < tol && r.count < count);
  const current = [...ladder].reverse().find((r) => r.tol <= tol)?.tol;
  const chips = model ? model.chipsAt(tol) : [];
  const families = familyOrder(
    chips.map((c) => c.family),
    state.templates
  );
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
        {!model && (
          <span className={classes.hint} role="status">
            Chords are found for a subset of 2 to {MAX_CHORDS} notes. Select a few more notes.
          </span>
        )}
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
          <Tip k="templates">Templates</Tip>{' '}
          <Num>{model?.templateCount ?? state.templates.length}</Num>
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
