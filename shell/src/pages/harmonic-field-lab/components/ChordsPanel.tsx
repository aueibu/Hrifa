/** Chords panel: tolerance with a ladder; sections by note count, one row per family, one chip per voicing. */
import { Fragment, useMemo, useState } from 'react';
import { ActionIcon, Button, Modal, SegmentedControl, Switch } from '@mantine/core';
import {
  DEFAULT_TEMPLATES,
  FOLD_EDIT_NOTE,
  templateFolds,
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
import {
  chipOrder,
  groupChips,
  groupFoldId,
  shapeCounts,
  ratioGroupIds,
  representative,
} from '../state/chordGroups';
import {
  appearsAtTolerance,
  chipErrors,
  chipSortOptions,
  errorStats,
  noteErrorLines,
  sortCards,
  sortGroups,
  templateHeight,
  type ChordSort,
} from '../state/chordSort';
import { cpsRootIdx } from '../state/cpsRoot';
import { MAX_CHORDS, SIZES, cpsFactorNames, familyOrder, type ChordChip } from '../state/derive';
import { useLabDeveloperOptions } from '../state/developerOptions';
import { chordFoldIds, collapseAll, expandAll } from '../state/foldIds';
import { MAX_TEMPLATES } from '../state/labState';
import { ladderWindow, nearestHidden } from '../state/ladderWindow';
import { signedErrorTextColor } from '../state/tileColors';
import { ChordCard, fmtCentsList, pitchTexts, templateOn } from './ChordCard';
import { ChordLibrary } from './ChordLibrary';
import { FoldHead, GroupedCount, NestGuide, foldId, useFold, useGroupExpanded } from './Fold';
import { MinusIcon, PlusIcon, TrashIcon } from './icons';
import { PatternsEditor, PositionalSection, positionalGroupIds } from './Positional';
import { useSendHover } from './Send';
import { SketchRow } from './SketchRow';
import { DebouncedText, Num, Strip, Tip, severity, signed, useLab } from './ui';
import labClasses from './lab.module.css';
import classes from './panels.module.css';

/** The card's texts and ring for a ratio or CPS chord: pitches as ratios when every note has one (else cents), steps in cents. */
function cardParts(
  chip: Pick<ChordChip, 'rootIdx' | 'memberIdx'>,
  field: readonly Note[],
  ratios: readonly string[],
  repC: number
) {
  const order = chipOrder(chip, field, repC);
  const rootC = field[chip.rootIdx]?.c ?? 0;
  const ups = order.map((i) =>
    repC > 0 ? (((field[i].c - rootC) % repC) + repC) % repC : field[i].c - rootC
  );
  const asRatios = order.length > 0 && order.every((i) => field[i].m);
  return {
    ups,
    ...pitchTexts(ups, asRatios ? order.map((i) => ratios[i]) : null),
  };
}

/** A found chip's notes as exact pitches for the shelf: the field's own pitches, root first, then upward from the root. */
function chipPitches(
  chip: Pick<ChordChip, 'rootIdx' | 'memberIdx'>,
  field: readonly Note[],
  repC: number
): Note[] {
  return chipOrder(chip, field, repC).map((i) => ({
    m: field[i].m ? { ...field[i].m } : null,
    c: field[i].c,
  }));
}

/** The template's true ratios placed on `root` (null when it does not parse): the chip's Exact send. */
function exactOn(root: Note | undefined, template: string): Note[] | null {
  const shape = root ? exactShape(template) : null;
  return root && shape ? placeShape(root, shape) : null;
}

/** M8i: a grouped Chip stands for `members` (same shape, different roots); `chip` is the representative it plays for. */
interface ChipGroupProps {
  members: ChordChip[];
  expanded: boolean;
  onToggle: () => void;
}

function Chip({
  chip,
  onRaise,
  group,
}: {
  chip: ChordChip;
  onRaise: (tol: number) => void;
  group?: ChipGroupProps;
}) {
  const lab = useLab();
  const isPicked = (c: ChordChip) =>
    lab.chordPicked !== null &&
    lab.chordPicked.size === c.memberIdx.length &&
    c.memberIdx.every((i) => lab.chordPicked?.has(i));
  // a group is picked when ANY of its members is the picked chord
  const picked = group ? group.members.some(isPicked) : isPicked(chip);
  const rootDeg = lab.base.rel.findIndex((r) => r.src === chip.rootIdx);
  const templateFamily = lab.state.templates.find((t) => t.text === chip.template)?.family;
  // the found chord as an item for the `-` popup and the right-click menu: its field notes, root first then upward
  const send = useSendHover(`chip:${group ? 'g:' : ''}${chip.template}:${chip.rootIdx}`, () => {
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
          detail: {
            template: chip.template,
            root: chip.root,
            // the template's own family (a template with none has none, not "Other")
            ...(templateFamily ? { family: templateFamily } : {}),
          },
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
  const n = group?.members.length ?? 1;
  const label = group
    ? `${chip.name} ${chip.template}, the same shape on ${n} roots. Click: hear it on the root of the Sketch row's stepper and keep it highlighted. Shift-click: make these notes the subset. Point and hold 1, 4 or 5 to hear it on that root (hold 5 its exact ratios). Press the arrow to show the ${n} roots one by one.`
    : chip.found
      ? `${chip.name} ${chip.template} on ${chip.root}: notes ${chip.members.join(' ')}. Largest error ${err}. Click: hear it and keep it highlighted. Shift-click: make these notes the subset, with ${chip.root} as the mode root. Point and hold 1 to hear it for as long as you hold the key; hold 4 plays it as in this field, and hold 5 its exact ratios, on the root of the Sketch row's stepper. Playing it, or holding 1, 4 or 5 on it, also arms this template in the Sketch row (the Sketch root stays where it is).`
      : `${chip.name} ${chip.template} would sit on ${chip.root} (notes ${chip.members.join(' ')}) but needs ${need} c of tolerance. Click to raise the tolerance to ${need} c.`;
  // the ring's tooltip line (the plain label without the key help, which the `chordChip` glossary entry carries)
  const ringTip = group
    ? `${chip.name} ${chip.template}, the same shape on ${n} roots.`
    : chip.found
      ? `${chip.name} ${chip.template} on ${chip.root}: notes ${chip.members.join(' ')}.`
      : `${chip.name} ${chip.template} would sit on ${chip.root} (notes ${chip.members.join(' ')}) but needs ${need} c of tolerance. Click to raise the tolerance to ${need} c.`;
  const parts = cardParts(chip, lab.base.field, lab.base.ratios, lab.base.repC);
  // a grouped card shows the SHAPE of its first member (cents above the root), so it does not change when the Sketch stepper moves
  const first = group?.members[0] ?? chip;
  const shape = group ? cardParts(first, lab.base.field, lab.base.ratios, lab.base.repC) : parts;
  const sevFirst = severity(first.maxErr);
  // M4: per-note errors of the card's figures (a grouped card shows its first member's); a dashed card has none
  const [dev] = useLabDeveloperOptions();
  const noteErrors = chip.found ? chipErrors(first, lab.base.field, lab.base.repC) : null;
  // H-38: the stat is the SIGNED worst (the note with the largest size) and the signed average, colored by the worst
  const stats = noteErrors ? errorStats(noteErrors) : null;
  // the tooltip's sentences (finder order) and tolerance line need error data, like the card's own figures
  const noteLines = noteErrors ? noteErrorLines(first, lab.base.field, lab.base.rep) : null;
  return (
    <ChordCard
      label={label}
      ringTip={ringTip}
      title={chip.name}
      subtitle={group ? chip.template : templateOn(chip.template, chip.root)}
      pitches={group ? fmtCentsList(shape.ups) : parts.pitches}
      steps={shape.steps}
      errors={noteErrors}
      noteLines={noteLines}
      appearsAt={noteErrors ? appearsAtTolerance(first.maxErr) : undefined}
      showErrors={dev.cardNoteErrors}
      group={
        group
          ? {
              count: n,
              expanded: group.expanded,
              label: `${group.expanded ? 'Hide' : 'Show'} the ${n} roots of ${chip.name}`,
              onToggle: group.onToggle,
            }
          : undefined
      }
      stat={
        chip.found ? (
          <span
            className={classes.err}
            data-sev={sevFirst}
            data-dir={stats && sevFirst > 0 ? (stats.worst > 0 ? 'sharp' : 'flat') : undefined}
            style={stats ? { color: signedErrorTextColor(stats.worst) } : undefined}
          >
            <Num>
              {sevFirst === 0
                ? 'exact'
                : stats === null
                  ? `${first.maxErr.toFixed(1)} c`
                  : `${signed(stats.worst)} (${signed(stats.avg)}) c`}
            </Num>
          </span>
        ) : (
          <span className={classes.need}>
            <Num>+{need} c</Num>
          </span>
        )
      }
      ring={{ cents: parts.ups, repC: lab.base.repC }}
      found={chip.found}
      picked={picked}
      pressable={chip.found}
      onEnter={(e) => {
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
      onLeave={() => {
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
      stash={
        chip.found
          ? {
              label: `Stash ${chip.template} on ${chip.root} on the shelf`,
              onStash: () =>
                lab.dispatch({
                  type: 'shelf/stash',
                  stash: {
                    pitches: chipPitches(chip, lab.base.field, lab.base.repC),
                    template: chip.template,
                    rootDeg: rootDeg >= 0 ? rootDeg : null,
                    date: new Date().toISOString(),
                  },
                }),
            }
          : undefined
      }
    />
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
  const label = `${kind} chord ${name}: ${g.type === 'harmonic' ? `the notes that share ${common}` : `the notes inside ${common}`} (${g.members.length} notes). Click: hear it and keep it highlighted. Shift-click: make these notes the subset. Point and hold 1 to hear it for as long as you hold the key; with the pointer on this chip, hold 4 plays it on the root of the Sketch row's stepper (the chord as in this field) and hold 5 does the same: a CPS chord has no separate exact form. Holding 1, 4 or 5 on it also arms its chord in the Sketch row (the Sketch root stays).`;
  const parts = cardParts(
    { rootIdx, memberIdx: idx },
    lab.base.field,
    lab.base.ratios,
    lab.base.repC
  );
  const ringTip = `${kind} chord ${name}: ${g.type === 'harmonic' ? `the notes that share ${common}` : `the notes inside ${common}`} (${g.members.length} notes).`;
  return (
    <ChordCard
      label={label}
      ringTip={ringTip}
      title={`${template ?? name} ${g.type === 'harmonic' ? 'otonal' : 'utonal'}`}
      subtitle={g.type === 'harmonic' ? `shares ${common}` : `inside ${common}`}
      pitches={parts.pitches}
      steps={parts.steps}
      stat={<Num muted>{g.members.length} notes</Num>}
      ring={{ cents: parts.ups, repC: lab.base.repC }}
      found
      cps={g.type}
      picked={picked}
      onEnter={(e) => {
        send.enter(e);
        lab.setChord(new Set(idx));
        lab.audio.setPreviewTarget(target());
      }}
      onLeave={() => {
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
      stash={{
        label: `Stash ${kind.toLowerCase()} ${name} on the shelf`,
        onStash: () =>
          lab.dispatch({
            type: 'shelf/stash',
            stash: {
              pitches: chipPitches({ rootIdx, memberIdx: idx }, lab.base.field, lab.base.repC),
              template,
              rootDeg: rootDeg >= 0 ? rootDeg : null,
              date: new Date().toISOString(),
            },
          }),
      }}
    />
  );
}

/** The chords that exist inside a CPS (a combination product set): otonal and utonal chips, shown for the CPS method only. */
function CpsChords() {
  const { base, tab, state } = useLab();
  const { chordSort, chordSortReverse } = state.ui;
  const labels = useMemo(() => cpsFactorNames(tab.gen), [tab.gen]);
  const chords = useMemo(() => cpsChords(base.field), [base.field]);
  // M4: the shared Sort control orders each row (Default = the lib's order); Otonal and Utonal stay two rows
  const sorted = useMemo(
    () =>
      sortCards(chords, {
        key: chordSort,
        reverse: chordSortReverse,
        found: () => true,
        rootC: (g) => base.field[cpsRootIdx(g, labels)]?.c ?? 0,
        height: (g) => templateHeight(cpsTemplate(g, labels)),
      }),
    [chords, chordSort, chordSortReverse, base.field, labels]
  );
  const oto = sorted.filter((g) => g.type === 'harmonic');
  const uto = sorted.filter((g) => g.type !== 'harmonic');
  const { folded } = useFold('cps');
  return (
    <section className={classes.family} aria-label="Chords inside this CPS">
      <h3 className={classes.treeHead} data-level="1">
        <FoldHead id="cps" tip="cpsChords" title="Chords inside this CPS" count={chords.length} />
      </h3>
      {!folded &&
        [
          { key: 'otonal', rows: oto },
          { key: 'utonal', rows: uto },
        ].map(({ key, rows }) => (
          <div
            key={key}
            className={`${classes.famRow} ${classes.nest}`}
            role="group"
            aria-label={`CPS ${key} chords`}
          >
            <h4 className={classes.treeHead} data-level="3">
              <Tip k={key === 'otonal' ? 'otonal' : 'utonal'}>
                {key === 'otonal' ? 'Otonal' : 'Utonal'}
              </Tip>
              <Num muted>{rows.length}</Num>
            </h4>
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
  const { state, dispatch, base } = useLab();
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
        // M7c: a template whose notes fold onto one pitch in the current repeat is skipped by the finder: one quiet line says so
        const folds = parsed.ok && templateFolds(parsed, base.repC);
        return (
          <Fragment key={i}>
            <div className={classes.editorRow}>
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
                classNames={{ error: classes.inputError }}
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
                  className={labClasses.dangerHover}
                  aria-label={`Remove ${t.name ?? t.text}`}
                  onClick={() => set(rows.filter((_, j) => j !== i))}
                >
                  <TrashIcon />
                </ActionIcon>
              </Tip>
            </div>
            {folds && (
              <span className={classes.editorNote} data-testid="fold-edit-note">
                {FOLD_EDIT_NOTE}
              </span>
            )}
          </Fragment>
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

/** M8i: a group of chips with the same shape on different roots: one card (playing for the root of the Sketch stepper), the per-root cards below it when expanded. */
function ChipGroup({
  members,
  id,
  onRaise,
}: {
  members: ChordChip[];
  id: string;
  onRaise: (tol: number) => void;
}) {
  const { base, state } = useLab();
  const { expanded, toggle } = useGroupExpanded(id);
  const n = base.rel.length;
  const stepper = n ? state.shelf.sketch.rootDeg % n : 0;
  const rep = representative(
    members,
    (c) => base.rel.findIndex((r) => r.src === c.rootIdx),
    stepper
  );
  return (
    <>
      <Chip chip={rep} onRaise={onRaise} group={{ members, expanded, onToggle: toggle }} />
      {expanded && (
        <div
          className={`${classes.chips} ${classes.nest}`}
          role="group"
          aria-label={`The ${members.length} roots of ${rep.name}`}
        >
          <NestGuide name={`the roots of ${rep.name}`} open toggle={toggle} />
          {members.map((c) => (
            <Chip key={c.rootIdx} chip={c} onRaise={onRaise} />
          ))}
        </div>
      )}
    </>
  );
}

/** One family row (Major, Septimal, ...) of a size section: its own fold, the count of found chips beside the label. */
function FamilyRow({
  size,
  family,
  row,
  onRaise,
}: {
  size: string;
  family: string;
  row: ChordChip[];
  onRaise: (tol: number) => void;
}) {
  const id = foldId('fam', size, family);
  const { folded } = useFold(id);
  const { base, state } = useLab();
  const counts = useMemo(
    () => shapeCounts(row, base.field, base.repC),
    [row, base.field, base.repC]
  );
  const { chordSort, chordSortReverse } = state.ui;
  const groups = useMemo(() => {
    const grouped = state.ui.groupShapes
      ? groupChips(row, base.field, base.repC)
      : row.map((c) => ({ key: null, members: [c] }));
    // M4: the Sort control orders the cards of this row and the roots inside each group; the row itself never moves
    return chordSort === 'default' && !chordSortReverse
      ? grouped
      : sortGroups(grouped, chipSortOptions(chordSort, chordSortReverse, base.field));
  }, [state.ui.groupShapes, row, base.field, base.repC, chordSort, chordSortReverse]);
  return (
    <div className={classes.famRow} role="group" aria-label={`${size}, ${family}`}>
      <h4 className={classes.treeHead} data-level="3">
        <FoldHead
          id={id}
          tip="chordFamily"
          title={family}
          count={<GroupedCount n={counts.n} m={counts.m} />}
          label={`${family} (${size})`}
        />
      </h4>
      <div className={classes.chips}>
        {!folded &&
          groups.map((g, i) =>
            g.members.length > 1 && g.key !== null ? (
              <ChipGroup
                key={g.key}
                id={groupFoldId(g.key)}
                members={g.members}
                onRaise={onRaise}
              />
            ) : (
              <Chip
                key={`${g.members[0].template}-${g.members[0].members.join()}-${i}`}
                chip={g.members[0]}
                onRaise={onRaise}
              />
            )
          )}
      </div>
    </div>
  );
}

/** The ratio chord families: the whole group folds, each size section (Triads, Tetras, ...) folds, and each family row folds. */
function FamiliesGroup({
  chips,
  families,
  onRaise,
}: {
  chips: ChordChip[];
  families: string[];
  onRaise: (tol: number) => void;
}) {
  const { folded } = useFold('families');
  const { base } = useLab();
  const total = useMemo(
    () => shapeCounts(chips, base.field, base.repC),
    [chips, base.field, base.repC]
  );
  return (
    <section className={classes.family} aria-label="Ratio chord families">
      <h3 className={classes.treeHead} data-level="1">
        <FoldHead
          id="families"
          tip="chordFamily"
          title="Ratio chords"
          count={<GroupedCount n={total.n} m={total.m} />}
        />
      </h3>
      {!folded &&
        SIZES.map((size) => {
          const inSize = chips.filter((c) => c.size === size);
          if (!inSize.length) {
            return null;
          }
          return (
            <SizeSection
              key={size}
              size={size}
              inSize={inSize}
              families={families}
              onRaise={onRaise}
            />
          );
        })}
    </section>
  );
}

function SizeSection({
  size,
  inSize,
  families,
  onRaise,
}: {
  size: string;
  inSize: ChordChip[];
  families: string[];
  onRaise: (tol: number) => void;
}) {
  const { folded, toggle } = useFold(foldId('size', size));
  const { base } = useLab();
  const counts = useMemo(
    () => shapeCounts(inSize, base.field, base.repC),
    [inSize, base.field, base.repC]
  );
  return (
    <section className={`${classes.family} ${classes.nest}`} aria-label={size}>
      <NestGuide name={size} open={!folded} toggle={toggle} />
      <h3 className={classes.treeHead} data-level="2">
        <FoldHead
          id={foldId('size', size)}
          tip="chordFamily"
          title={size}
          count={<GroupedCount n={counts.n} m={counts.m} />}
        />
      </h3>
      {!folded &&
        families.map((f) => {
          const row = inSize.filter((c) => c.family === f);
          return row.length ? (
            <FamilyRow key={f} size={size} family={f} row={row} onRaise={onRaise} />
          ) : null;
        })}
    </section>
  );
}

export function ChordsPanel() {
  const { an, state, dispatch, tab, base } = useLab();
  const [editing, setEditing] = useState(false);
  const [library, setLibrary] = useState(false);
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
  /** M8g: a window of 7 tiles around the current rung, with `+n` tiles for what is hidden at an edge. */
  const at = ladder.findIndex((r) => r.tol === current);
  const win = ladderWindow(ladder.length, at);
  const shown = ladder.slice(win.start, win.end);
  const pickIdx = (i: number) => ladder[i] && setTol(ladder[i].tol);
  // Collapse all | Expand all: the ids of what the panel renders now
  const foldIds = chordFoldIds({
    cps: tab.gen.method === 'cps',
    patterns: state.patterns.list,
    chips,
    sizes: SIZES,
  });
  return (
    <>
      <Strip title={<Tip k="chords">Chords</Tip>}>
        <Tip k="editTemplates" as="control">
          <Button size="compact-xs" variant="default" onClick={() => setEditing(true)}>
            Edit templates
          </Button>
        </Tip>
        <Tip k="chordLibrary" as="control">
          <Button size="compact-xs" variant="default" onClick={() => setLibrary(true)}>
            Chord library
          </Button>
        </Tip>
      </Strip>
      <div className={`${classes.panelBody} ${classes.chordsBody}`}>
        <div className={classes.chordsTop} data-testid="chords-top">
          <div className={classes.chordsFolds}>
            <Tip k="groupShapes" as="control">
              <Switch
                size="xs"
                className={classes.groupSwitch}
                label="Group shapes"
                checked={state.ui.groupShapes}
                onChange={(e) =>
                  dispatch({ type: 'ui', patch: { groupShapes: e.currentTarget.checked } })
                }
              />
            </Tip>
            <Tip k="chordSort" as="control">
              <SegmentedControl
                size="xs"
                aria-label="Sort chords"
                value={state.ui.chordSort}
                onChange={(v) => dispatch({ type: 'ui', patch: { chordSort: v as ChordSort } })}
                data={[
                  { label: 'Default', value: 'default' },
                  { label: 'Root', value: 'root' },
                  { label: 'Simplicity', value: 'simplicity' },
                ]}
              />
            </Tip>
            <Tip k="chordSort" as="control">
              <Switch
                size="xs"
                label="Reverse"
                checked={state.ui.chordSortReverse}
                onChange={(e) =>
                  dispatch({ type: 'ui', patch: { chordSortReverse: e.currentTarget.checked } })
                }
              />
            </Tip>
            <Tip k="collapseAllChords" as="control">
              <Button
                size="compact-xs"
                variant="default"
                aria-label="Collapse all sections"
                onClick={() => dispatch({ type: 'ui', patch: { folds: collapseAll(foldIds) } })}
              >
                Collapse all
              </Button>
            </Tip>
            <Tip k="expandAllChords" as="control">
              <Button
                size="compact-xs"
                variant="default"
                aria-label="Expand all sections"
                onClick={() => {
                  // everything opens, the roots of every shape group included (ids derived from what the panel renders)
                  const groupIds = state.ui.groupShapes
                    ? [
                        ...positionalGroupIds(
                          base,
                          state.patterns.list,
                          state.ui.positionalOrder,
                          state.ui.baseHz
                        ),
                        ...ratioGroupIds(chips, base.field, base.repC),
                      ]
                    : [];
                  dispatch({ type: 'ui', patch: { folds: expandAll(groupIds) } });
                }}
              >
                Expand all
              </Button>
            </Tip>
          </div>
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
            {win.before > 0 && (
              <button
                type="button"
                className={classes.rung}
                data-more="before"
                aria-label={`${win.before} more tolerances below; pick the nearest`}
                onClick={() => pickIdx(nearestHidden(win, 'before'))}
              >
                <Num>+{win.before}</Num>
              </button>
            )}
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
            {win.after > 0 && (
              <button
                type="button"
                className={classes.rung}
                data-more="after"
                aria-label={`${win.after} more tolerances above; pick the nearest`}
                onClick={() => pickIdx(nearestHidden(win, 'after'))}
              >
                <Num>+{win.after}</Num>
              </button>
            )}
          </div>
        </div>
        <div className={classes.chordsList}>
          {tab.gen.method === 'cps' && <CpsChords />}
          <PositionalSection />
          <FamiliesGroup chips={chips} families={families} onRaise={setTol} />
          <span className={classes.foot}>
            <Tip k="templates">Templates</Tip>{' '}
            <Num>{model?.templateCount ?? state.templates.length}</Num>
          </span>
        </div>
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
      <Modal
        opened={library}
        onClose={() => setLibrary(false)}
        title="Chord library"
        size="min(88rem, 96vw)"
        transitionProps={{ duration: 0 }}
      >
        <ChordLibrary />
      </Modal>
    </>
  );
}
