/** Chords panel: tolerance with a ladder; sections by note count, one row per family, one chip per voicing. */
import { useMemo, useState } from 'react';
import { ActionIcon, Button, Modal, Tooltip } from '@mantine/core';
import {
  DEFAULT_TEMPLATES,
  chordShape,
  exactShape,
  placeShape,
  type Note,
  cpsChords,
  parseTemplate,
  type ChordTemplate,
  type CpsChord,
} from '../../../lib/harmonic-field';
import type { PreviewTarget } from '../audio/plan';
import { cpsRootIdx } from '../state/cpsRoot';
import { MAX_CHORDS, SIZES, cpsFactorNames, familyOrder, type ChordChip } from '../state/derive';
import { MAX_TEMPLATES } from '../state/labState';
import { MinusIcon, PlusIcon, TrashIcon } from './icons';
import { PatternsEditor, PositionalSection } from './Positional';
import { useSendHover } from './Send';
import { SketchRow } from './SketchRow';
import {
  DebouncedText,
  Num,
  SEV_LABEL,
  Strip,
  Tip,
  severity,
  useLab,
  useNativeTitle,
  useTooltipProps,
} from './ui';
import classes from './panels.module.css';

/** A found chip's notes as exact pitches for the shelf: the field's own pitches, root first, then upward from the root. */
function chipPitches(
  chip: Pick<ChordChip, 'rootIdx' | 'memberIdx'>,
  field: readonly Note[],
  repC: number
): Note[] {
  const rootC = field[chip.rootIdx]?.c ?? 0;
  const up = (i: number) => (repC > 0 ? (((field[i].c - rootC) % repC) + repC) % repC : field[i].c);
  const rest = [...new Set(chip.memberIdx)]
    .filter((i) => i !== chip.rootIdx && field[i])
    .sort((a, b) => up(a) - up(b));
  return [chip.rootIdx, ...rest]
    .filter((i) => field[i])
    .map((i) => ({ m: field[i].m ? { ...field[i].m } : null, c: field[i].c }));
}

/** The template's true ratios placed on `root` (null when it does not parse): the chip's Exact send. */
function exactOn(root: Note | undefined, template: string): Note[] | null {
  const shape = root ? exactShape(template) : null;
  return root && shape ? placeShape(root, shape) : null;
}

function Chip({ chip, onRaise }: { chip: ChordChip; onRaise: (tol: number) => void }) {
  const lab = useLab();
  const tipProps = useTooltipProps();
  const nativeTitle = useNativeTitle();
  const picked =
    lab.chordPicked !== null &&
    lab.chordPicked.size === chip.memberIdx.length &&
    chip.memberIdx.every((i) => lab.chordPicked?.has(i));
  const sev = severity(chip.maxErr);
  const rootDeg = lab.base.rel.findIndex((r) => r.src === chip.rootIdx);
  // the found chord as an item for the `-` popup and the right-click menu: its field notes, root first then upward
  const send = useSendHover(`chip:${chip.template}:${chip.rootIdx}`, () => {
    const { field, rep, repC } = lab.base;
    const pitches = chipPitches(chip, field, repC);
    return chip.found && pitches.length
      ? {
          kind: 'chord',
          label: `${chip.name} on ${chip.root}`,
          pitches,
          rep,
          // Exact send: the template's true ratios on the same root
          exact: exactOn(field[chip.rootIdx], chip.template),
          detail: { template: chip.template, root: chip.root },
          // the right-click menu's Stash on shelf (the same as the + button)
          stash: {
            pitches: chipPitches(chip, field, repC),
            template: chip.template,
            rootDeg: rootDeg >= 0 ? rootDeg : null,
          },
        }
      : null;
  });
  const need = Math.ceil(chip.needs - 1e-9);
  const err = chip.maxErr < 1e-6 ? 'none (exact)' : `${chip.maxErr.toFixed(1)} c`;
  const label = chip.found
    ? `${chip.name} ${chip.template} on ${chip.root}: notes ${chip.members.join(' ')}. Largest error ${err}. Click: hear it and keep it highlighted. Shift-click: make these notes the subset, with ${chip.root} as the mode root. Point and hold 1 to hear it for as long as you hold the key; hold 4 plays it as in this field, and hold 5 its exact ratios, on the root of the Sketch row's stepper. Playing it also arms this template in the Sketch row.`
    : `${chip.name} ${chip.template} would sit on ${chip.root} (notes ${chip.members.join(' ')}) but needs ${need} c of tolerance. Click to raise the tolerance to ${need} c.`;
  return (
    <span className={classes.chipWrap} data-stash={chip.found || undefined}>
      <Tooltip label={label} multiline w={260} {...tipProps}>
        <button
          type="button"
          className={classes.chip}
          data-found={chip.found}
          aria-label={label}
          data-picked={picked}
          aria-pressed={chip.found ? picked : undefined}
          onMouseEnter={(e) => {
            send.enter(e);
            lab.setChord(new Set(chip.memberIdx));
            if (chip.found) {
              lab.audio.setPreviewTarget({
                kind: 'chord',
                idx: chip.memberIdx,
                template: chip.template,
                rootIdx: chip.rootIdx,
              });
            }
          }}
          onMouseLeave={() => {
            send.leave();
            lab.setChord(null);
            lab.audio.clearPreviewTarget({ kind: 'chord', idx: chip.memberIdx });
          }}
          onFocus={() => {
            lab.setChord(new Set(chip.memberIdx));
            if (chip.found) {
              lab.audio.setPreviewTarget({
                kind: 'chord',
                idx: chip.memberIdx,
                template: chip.template,
                rootIdx: chip.rootIdx,
              });
            }
          }}
          onBlur={() => {
            lab.setChord(null);
            lab.audio.clearPreviewTarget({ kind: 'chord', idx: chip.memberIdx });
          }}
          onClick={(e) => {
            if (!chip.found) {
              onRaise(need);
            } else if (e.shiftKey) {
              // the chord becomes the subset, rooted on the chord's own root (as the prototype did)
              lab.pickChord(null);
              lab.setChord(null);
              const sorted = [...new Set(chip.memberIdx)].sort((a, b) => a - b);
              lab.dispatch({
                type: 'sel/set',
                idx: sorted,
                mode: Math.max(0, sorted.indexOf(chip.rootIdx)),
              });
            } else if (picked) {
              lab.pickChord(null);
            } else {
              lab.pickChord(new Set(chip.memberIdx));
              lab.audio.playFieldChord(chip.memberIdx, chip.rootIdx);
              lab.dispatch({
                type: 'sketch/arm',
                template: chip.template,
                rootDeg: rootDeg >= 0 ? rootDeg : undefined,
                shape: chordShape(lab.base.field, lab.base.rep, chip.rootIdx, chip.memberIdx),
              });
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
              <span
                className={classes.err}
                data-sev={sev}
                title={nativeTitle(`Error ${SEV_LABEL[sev]}`)}
              >
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
      {chip.found && (
        <button
          type="button"
          className={classes.chipStash}
          aria-label={`Stash ${chip.template} on ${chip.root} on the shelf`}
          title={nativeTitle('Stash this chord on the shelf')}
          onClick={() =>
            lab.dispatch({
              type: 'shelf/stash',
              stash: {
                pitches: chipPitches(chip, lab.base.field, lab.base.repC),
                template: chip.template,
                rootDeg: rootDeg >= 0 ? rootDeg : null,
                date: new Date().toISOString(),
              },
            })
          }
        >
          <PlusIcon />
        </button>
      )}
    </span>
  );
}

/** A CPS chord's name: the factors that vary, as 4:5:6 (otonal) or 1/4:1/5:1/6 (utonal). */
const cpsName = (g: CpsChord, labels: readonly string[]) =>
  [...g.members]
    .sort((a, b) => Number(labels[a.x] ?? a.x) - Number(labels[b.x] ?? b.x))
    .map((m) => `${g.type === 'harmonic' ? '' : '1/'}${labels[m.x] ?? m.x}`)
    .join(':');

/** The CPS chord as a template text the Sketch row can arm (4:5:6, or 1/(4:5:6) for utonal), or null when its factor names are not whole numbers. */
function cpsTemplate(g: CpsChord, labels: readonly string[]): string | null {
  const parts = [...g.members]
    .sort((a, b) => Number(labels[a.x] ?? a.x) - Number(labels[b.x] ?? b.x))
    .map((m) => String(labels[m.x] ?? m.x));
  const body = parts.join(':');
  const text = g.type === 'harmonic' ? body : `1/(${body})`;
  return parseTemplate(text).ok ? text : null;
}

/** A chip of the "Chords inside this CPS" rows: behaves like a ratio chip (stash +, `-` send, right-click, arming for hold 4). */
function CpsChip({ g, labels }: { g: CpsChord; labels: readonly string[] }) {
  const lab = useLab();
  const tipProps = useTooltipProps();
  const nativeTitle = useNativeTitle();
  const idx = g.members.map((m) => m.i);
  const picked =
    lab.chordPicked !== null &&
    lab.chordPicked.size === idx.length &&
    idx.every((i) => lab.chordPicked?.has(i));
  const common = g.common.map((x) => labels[x] ?? x).join('·');
  const name = cpsName(g, labels);
  const template = cpsTemplate(g, labels);
  // the chord's root in ROOT POSITION, from its factor labels (not the lowest reduced pitch, which differs when the chord wraps the
  // repeat): an otonal 3:5:7 sits on the 3 (smallest label), a utonal 1/(3:5:7) on 1/7 (largest label)
  const rootIdx = cpsRootIdx(g, labels);
  const rootDeg = lab.base.rel.findIndex((r) => r.src === rootIdx);
  const kind = g.type === 'harmonic' ? 'Otonal' : 'Utonal';
  const target = (): PreviewTarget => ({
    kind: 'chord',
    idx,
    rootIdx,
    ...(template ? { template } : {}),
    noExact: true,
  });
  const send = useSendHover(`cps:${g.type}:${g.common.join(',')}`, () => {
    const { field, rep, repC, ratios } = lab.base;
    const pitches = chipPitches({ rootIdx, memberIdx: idx }, field, repC);
    return pitches.length
      ? {
          kind: 'chord',
          label: `${kind} ${name}`,
          pitches,
          rep,
          detail: { template, root: ratios[rootIdx] ?? null },
          stash: {
            pitches: chipPitches({ rootIdx, memberIdx: idx }, field, repC),
            template,
            rootDeg: rootDeg >= 0 ? rootDeg : null,
          },
        }
      : null;
  });
  const label = `${kind} chord ${name}: ${g.type === 'harmonic' ? `the notes that share ${common}` : `the notes inside ${common}`} (${g.members.length} notes). Click: hear it and keep it highlighted. Shift-click: make these notes the subset. Point and hold 1 to hear it for as long as you hold the key; with the pointer on this chip, hold 4 plays it on the root of the Sketch row's stepper (the chord as in this field) and hold 5 does the same: a CPS chord has no separate exact form.`;
  return (
    <span className={classes.chipWrap} data-stash="true">
      <Tooltip label={label} multiline w={260} {...tipProps}>
        <button
          type="button"
          className={classes.chip}
          data-found="true"
          data-cps={g.type}
          aria-label={label}
          data-picked={picked}
          aria-pressed={picked}
          onMouseEnter={(e) => {
            send.enter(e);
            lab.setChord(new Set(idx));
            lab.audio.setPreviewTarget(target());
          }}
          onMouseLeave={() => {
            send.leave();
            lab.setChord(null);
            lab.audio.clearPreviewTarget({ kind: 'chord', idx });
          }}
          onFocus={() => {
            lab.setChord(new Set(idx));
            lab.audio.setPreviewTarget(target());
          }}
          onBlur={() => {
            lab.setChord(null);
            lab.audio.clearPreviewTarget({ kind: 'chord', idx });
          }}
          onClick={(e) => {
            if (e.shiftKey) {
              lab.pickChord(null);
              lab.setChord(null);
              lab.dispatch({
                type: 'sel/set',
                idx: [...new Set(idx)].sort((a, b) => a - b),
                mode: 0,
              });
            } else if (picked) {
              lab.pickChord(null);
            } else {
              lab.pickChord(new Set(idx));
              lab.audio.playFieldChord(idx, rootIdx);
              if (template) {
                // like a ratio chip: playing it arms its template and its shape in the Sketch row (hold 4 and 5 use it)
                lab.dispatch({
                  type: 'sketch/arm',
                  template,
                  rootDeg: rootDeg >= 0 ? rootDeg : undefined,
                  shape: chordShape(lab.base.field, lab.base.rep, rootIdx, idx),
                });
              }
            }
          }}
        >
          <span className={classes.chipTop}>
            <Num>{name}</Num>
          </span>
          <span className={classes.chipBottom}>
            <Num muted>{g.type === 'harmonic' ? `share ${common}` : `inside ${common}`}</Num>
          </span>
        </button>
      </Tooltip>
      <button
        type="button"
        className={classes.chipStash}
        aria-label={`Stash ${kind.toLowerCase()} ${name} on the shelf`}
        title={nativeTitle('Stash this chord on the shelf')}
        onClick={() =>
          lab.dispatch({
            type: 'shelf/stash',
            stash: {
              pitches: chipPitches({ rootIdx, memberIdx: idx }, lab.base.field, lab.base.repC),
              template,
              rootDeg: rootDeg >= 0 ? rootDeg : null,
              date: new Date().toISOString(),
            },
          })
        }
      >
        <PlusIcon />
      </button>
    </span>
  );
}

/** The chords that exist inside a CPS (a combination product set): otonal and utonal chips, shown for the CPS method only. */
function CpsChords() {
  const { base, tab } = useLab();
  const labels = useMemo(() => cpsFactorNames(tab.gen), [tab.gen]);
  const chords = useMemo(() => cpsChords(base.field), [base.field]);
  const oto = chords.filter((g) => g.type === 'harmonic');
  const uto = chords.filter((g) => g.type !== 'harmonic');
  return (
    <section className={classes.family} aria-label="Chords inside this CPS">
      <h3 className={classes.familyHead}>
        <Tip k="cpsChords">Chords inside this CPS</Tip>
        <Num muted>{chords.length}</Num>
      </h3>
      {[
        { key: 'otonal', rows: oto },
        { key: 'utonal', rows: uto },
      ].map(({ key, rows }) => (
        <div key={key} className={classes.famRow} role="group" aria-label={`CPS ${key} chords`}>
          <span className={classes.famLabel}>
            <Tip k={key === 'otonal' ? 'otonal' : 'utonal'}>
              {key === 'otonal' ? 'Otonal' : 'Utonal'}
            </Tip>{' '}
            <Num muted>{rows.length}</Num>
          </span>
          <div className={classes.chips}>
            {rows.length ? (
              rows.map((g) => (
                <CpsChip key={`${g.type}:${g.common.join(',')}`} g={g} labels={labels} />
              ))
            ) : (
              <span className={classes.hint}>none</span>
            )}
          </div>
        </div>
      ))}
    </section>
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
      <PatternsEditor />
    </div>
  );
}

export function ChordsPanel() {
  const { an, state, dispatch, tab } = useLab();
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
        <SketchRow />
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
        {tab.gen.method === 'cps' && <CpsChords />}
        <PositionalSection />
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
