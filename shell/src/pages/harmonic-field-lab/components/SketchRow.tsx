/**
 * Sketch row (M8a), at the top of the Chords panel: any template on any root of the subset, even when the field lacks some of
 * its notes. Play sketch sounds the chord as the "Field | Exact" switch says (default: as the field gives it, the armed
 * chord's shape or the template found at the root; Exact: the true ratios); found notes are marked, outsiders show their
 * distance in cents to the nearest field note; Stash puts the pitches heard on the shelf. A chord chip or shelf slot that plays
 * arms its template and shape here (hold 4 on a note moves that shape onto it, hold 5 plays the exact ratios there).
 */
import { useEffect, useMemo, useRef } from 'react';
import { ActionIcon, Button, NativeSelect, SegmentedControl } from '@mantine/core';
import {
  matchToField,
  parsePattern,
  placeShape,
  positionalNaming,
  sketchShape,
  type ChordTemplate,
  type Note,
} from '../../../lib/harmonic-field';
import { OTHER_FAMILY, familyOrder, noteLabel } from '../state/derive';
import { autoName } from '../state/generate';
import { sketchPositionalPitches } from '../state/sketchChord';
import { PlayIcon } from './icons';
import { tooFewHint } from './Positional';
import { Num, Tip, severity, useLab, useNativeTitle } from './ui';
import { ValueList } from './ValueList';
import classes from './panels.module.css';

/** Template dropdown data: the templates grouped by family (the chord finder's family order), the text as the value. */
function templateOptions(templates: ChordTemplate[], current: string | null) {
  const seen = new Set<string>();
  const groups = familyOrder([], templates)
    .map((f) => ({
      group: f,
      items: templates
        .filter((t) => (t.family ?? OTHER_FAMILY) === f)
        .filter((t) => (seen.has(t.text) ? false : (seen.add(t.text), true)))
        .map((t) => ({ value: t.text, label: t.name ? `${t.name} (${t.text})` : t.text })),
    }))
    .filter((g) => g.items.length > 0);
  // a template that was edited away from the list stays selectable as what it is
  if (current !== null && !seen.has(current)) {
    groups.unshift({ group: 'Armed', items: [{ value: current, label: current }] });
  }
  return groups;
}

/** The dropdown value of a positional pattern (a ratio template's value is its text, which never starts with this). */
const POS_PREFIX = 'pos:';

/** The "Positional" group: the user's patterns, plus the current one when it was edited away from the list. */
function positionalGroup(list: readonly string[], current: string | null) {
  const items = [...list];
  if (current !== null && !items.includes(current)) {
    items.unshift(current);
  }
  return items.length
    ? [{ group: 'Positional', items: items.map((p) => ({ value: `${POS_PREFIX}${p}`, label: p })) }]
    : [];
}

export function SketchRow() {
  const lab = useLab();
  const { state, tab, base, dispatch, audio } = lab;
  const sk = state.shelf.sketch;
  const nativeTitle = useNativeTitle();
  const templates = state.templates;
  const n = base.rel.length;
  // the first template is picked when the row opens with none
  useEffect(() => {
    if (sk.template === null && templates[0]) {
      dispatch({ type: 'sketch/set', patch: { template: templates[0].text } });
    }
  }, [sk.template, templates, dispatch]);
  const positionalPattern = sk.positional?.pattern ?? null;
  const patterns = state.patterns.list;
  const options = useMemo(
    () => [
      ...templateOptions(templates, sk.template),
      ...positionalGroup(patterns, positionalPattern),
    ],
    [templates, sk.template, patterns, positionalPattern]
  );
  const deg = n ? sk.rootDeg % n : 0;
  const rootIdx = n ? base.rel[deg].src : -1;
  const root: Note | undefined = tab.field[rootIdx];
  // the chord as the field realizes it (the armed chord's shape, else the template found at the root), or its exact ratios
  const tol = state.ui.tol;
  const pitches = useMemo(() => {
    if (sk.positional) {
      // M9: the pattern at the sketch root degree of the active subset (root position)
      return sketchPositionalPitches(tab.field, tab.rep, base.idx, base.mode, sk);
    }
    const shape =
      root && sk.template
        ? sketchShape(
            tab.field,
            tab.rep,
            root,
            sk.template,
            sk.shape,
            tol,
            sk.exact ? 'exact' : 'field'
          )
        : null;
    return root && shape ? placeShape(root, shape) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    root,
    sk.template,
    sk.shape,
    sk.exact,
    sk.positional,
    sk.rootDeg,
    tab.field,
    tab.rep,
    tol,
    base.idx,
    base.mode,
  ]);
  // the positional chord's name: `2-2 on 4`, then `7 of 12-EDO · 400-300 c`
  const genName = tab.gen.preset || autoName(tab.gen);
  const naming = useMemo(() => {
    const steps = sk.positional ? parsePattern(sk.positional.pattern) : null;
    return steps && pitches
      ? positionalNaming(
          { pattern: steps, degree: n ? sk.rootDeg % n : 0, pitches },
          n,
          genName,
          templates
        )
      : null;
  }, [sk.positional, sk.rootDeg, pitches, n, genName, templates]);
  const match = useMemo(
    () => (pitches ? matchToField(tab.field, tab.rep, pitches) : []),
    [pitches, tab.field, tab.rep]
  );
  // absolute pitches light the field; what sounds follows Parallel | Relative like the chord chips and mode previews
  const abs = useMemo(() => (pitches ?? []).map((p) => p.c), [pitches]);
  const parallel = state.ui.modePlayback !== 'relative';
  // Parallel puts the chord's own root (the first pitch) on 1/1, like the shelf slot of the same chord
  const cents = useMemo(() => abs.map((c) => (parallel ? c - abs[0] : c)), [abs, parallel]);
  const found = useMemo(
    () => new Set(match.flatMap((m) => (m.idx === null ? [] : [m.idx]))),
    [match]
  );
  const step = (by: number) =>
    dispatch({ type: 'sketch/set', patch: { rootDeg: (((deg + by) % n) + n) % n } });
  const target = {
    kind: 'pitches',
    key: `sketch:${cents.join(',')}`,
    cents,
    light: abs,
  } as const;
  // the chord changed under a resting pointer (root, template): hold 1 must play the new one
  const hovered = useRef(false);
  const keyNow = target.key;
  useEffect(() => {
    if (hovered.current && cents.length) {
      audio.setPreviewTarget(target);
      lab.setChord(found, abs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyNow]);
  const tooBig = sk.positional && n > 0 ? tooFewHint(n, sk.positional.pattern) : null;
  const bad = sk.positional === null && sk.template !== null && !pitches && n > 0;
  return (
    <div
      className={classes.sketch}
      role="group"
      aria-label="Sketch a chord"
      data-armed={sk.armed || undefined}
    >
      <div className={classes.sketchControls}>
        <Tip k="sketchRow">Sketch</Tip>
        <NativeSelect
          size="xs"
          aria-label="Sketch template"
          data={options}
          value={
            positionalPattern !== null ? `${POS_PREFIX}${positionalPattern}` : (sk.template ?? '')
          }
          onChange={(e) => {
            const v = e.currentTarget.value;
            dispatch({
              type: 'sketch/set',
              // a ratio template always says positional: null, so picking one leaves positional mode even when its text is unchanged
              patch: v.startsWith(POS_PREFIX)
                ? { positional: { pattern: v.slice(POS_PREFIX.length) } }
                : { template: v, positional: null },
            });
          }}
        />
        <span className={classes.sketchRoot}>
          <ActionIcon
            variant="default"
            size="sm"
            aria-label="Previous root degree"
            disabled={n < 2}
            onClick={() => step(-1)}
          >
            &lsaquo;
          </ActionIcon>
          <span className={classes.tolValue}>
            root <Num>{n ? deg + 1 : '–'}</Num>
            {root && <Num muted> {base.ratios[rootIdx]}</Num>}
          </span>
          <ActionIcon
            variant="default"
            size="sm"
            aria-label="Next root degree"
            disabled={n < 2}
            onClick={() => step(1)}
          >
            &rsaquo;
          </ActionIcon>
        </span>
        <Tip
          k="sketchRealization"
          as="control"
          extra={
            sk.positional
              ? 'Off while a positional chord is picked: its notes are always the field notes the pattern lands on, so there are no separate exact ratios.'
              : undefined
          }
        >
          <SegmentedControl
            size="xs"
            disabled={sk.positional !== null}
            aria-label="Sketch realization"
            data={['Field', 'Exact']}
            value={sk.exact ? 'Exact' : 'Field'}
            onChange={(v) => dispatch({ type: 'sketch/set', patch: { exact: v === 'Exact' } })}
            className={classes.tinySeg}
          />
        </Tip>
        <Button
          size="compact-xs"
          variant="default"
          leftSection={<PlayIcon />}
          disabled={!pitches}
          onClick={() => audio.playCents(cents, abs)}
        >
          Play sketch
        </Button>
        <Tip k="stashChord" as="control">
          <Button
            size="compact-xs"
            variant="default"
            disabled={!pitches}
            onClick={() =>
              dispatch({
                type: 'shelf/stash',
                stash: {
                  pitches: pitches ?? [],
                  template: naming ? naming.label : sk.template,
                  pattern: naming && sk.positional ? sk.positional.pattern : null,
                  tail: naming && sk.positional ? naming.tail : null,
                  rootDeg: n ? deg : null,
                  date: new Date().toISOString(),
                },
              })
            }
          >
            Stash
          </Button>
        </Tip>
      </div>
      {n === 0 && (
        <span className={classes.hint} role="status">
          Select a note to put a chord on it.
        </span>
      )}
      {tooBig && (
        <span className={classes.hint} role="status">
          {tooBig}
        </span>
      )}
      {bad && (
        <span className={classes.hint} role="status">
          This template does not parse.
        </span>
      )}
      {pitches && (
        <div
          className={classes.sketchNotes}
          role="list"
          aria-label="Sketch chord notes"
          onMouseEnter={() => {
            hovered.current = true;
            lab.setChord(found, abs);
            audio.setPreviewTarget(target);
          }}
          onMouseLeave={() => {
            hovered.current = false;
            lab.setChord(null);
            audio.clearPreviewTarget(target);
          }}
        >
          {pitches.map((p, i) => {
            const m = match[i];
            const hit = m?.idx !== null && m?.idx !== undefined;
            const off = !hit && m && Number.isFinite(m.dist) ? m.dist : null;
            return (
              <span
                key={i}
                role="listitem"
                className={classes.sketchNote}
                data-found={hit}
                data-sev={hit ? 0 : off === null ? undefined : severity(Math.abs(off))}
                aria-label={
                  hit
                    ? `${noteLabel(p)}: a field note`
                    : off === null
                      ? `${noteLabel(p)}: no field note`
                      : `${noteLabel(p)}: not in the field, nearest field note is ${Math.abs(off).toFixed(1)} c ${off >= 0 ? 'above' : 'below'}`
                }
              >
                <Num>{noteLabel(p)}</Num>
                <Num muted>
                  {hit
                    ? 'in field'
                    : off === null
                      ? '–'
                      : `${off >= 0 ? '+' : '−'}${Math.abs(off).toFixed(1)} c`}
                </Num>
              </span>
            );
          })}
        </div>
      )}
      {pitches && pitches.length > 0 && (
        <div
          className={classes.sketchInfo}
          data-testid="sketch-info"
          title={nativeTitle(
            'Point at any note and hold 4 to hear this chord on it as the field has it, 5 for the exact ratios (a positional chord gives the same notes for both).'
          )}
        >
          {naming ? (
            <span className={classes.hint} data-testid="sketch-line">
              {naming.label}
              {naming.ratio ? ` · ${naming.ratio}` : ''}
            </span>
          ) : (
            <span className={classes.hint} data-testid="sketch-name">
              {templates.find((t) => t.text === sk.template)?.name ?? sk.template ?? ''}
            </span>
          )}
          <span data-testid="sketch-cents">
            <Num muted>
              <ValueList text={`${pitches.map((p) => p.c.toFixed(1)).join(', ')} c`} />
            </Num>
          </span>
          {pitches.length > 1 && (
            <span data-testid="sketch-steps">
              <Num muted>
                <ValueList
                  text={`steps ${pitches
                    .slice(1)
                    .map((p, i) => (p.c - pitches[i].c).toFixed(1))
                    .join(', ')} c`}
                />
              </Num>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
