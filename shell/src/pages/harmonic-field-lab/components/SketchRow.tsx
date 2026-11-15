/**
 * Sketch row (M8a), at the top of the Chords panel: any template on any root of the subset, even when the field lacks some of
 * its notes. Play sounds the exact chord; found notes are marked, outsiders show their distance in cents to the nearest field
 * note; Stash puts the exact pitches on the shelf. A chord chip that plays arms its template here (hold 4 on a note then plays
 * it rooted on that note).
 */
import { useEffect, useMemo, useRef } from 'react';
import { ActionIcon, Button, NativeSelect } from '@mantine/core';
import {
  matchToField,
  sketchPitches,
  type ChordTemplate,
  type Note,
} from '../../../lib/harmonic-field';
import { OTHER_FAMILY, familyOrder, noteLabel } from '../state/derive';
import { PlayIcon } from './icons';
import { Num, Tip, useLab } from './ui';
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

export function SketchRow() {
  const lab = useLab();
  const { state, tab, base, dispatch, audio } = lab;
  const sk = state.shelf.sketch;
  const templates = state.templates;
  const n = base.rel.length;
  // the first template is picked when the row opens with none
  useEffect(() => {
    if (sk.template === null && templates[0]) {
      dispatch({ type: 'sketch/set', patch: { template: templates[0].text } });
    }
  }, [sk.template, templates, dispatch]);
  const options = useMemo(() => templateOptions(templates, sk.template), [templates, sk.template]);
  const deg = n ? sk.rootDeg % n : 0;
  const rootIdx = n ? base.rel[deg].src : -1;
  const root: Note | undefined = tab.field[rootIdx];
  const pitches = useMemo(
    () => (root && sk.template ? sketchPitches(root, sk.template) : null),
    [root, sk.template]
  );
  const match = useMemo(
    () => (pitches ? matchToField(tab.field, tab.rep, pitches) : []),
    [pitches, tab.field, tab.rep]
  );
  const cents = useMemo(() => (pitches ?? []).map((p) => p.c), [pitches]);
  const found = useMemo(
    () => new Set(match.flatMap((m) => (m.idx === null ? [] : [m.idx]))),
    [match]
  );
  const step = (by: number) =>
    dispatch({ type: 'sketch/set', patch: { rootDeg: (((deg + by) % n) + n) % n } });
  const target = { kind: 'pitches', key: `sketch:${cents.join(',')}`, cents } as const;
  // the chord changed under a resting pointer (root, template): hold 1 must play the new one
  const hovered = useRef(false);
  const keyNow = target.key;
  useEffect(() => {
    if (hovered.current && cents.length) {
      audio.setPreviewTarget(target);
      lab.setChord(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyNow]);
  const bad = sk.template !== null && !pitches && n > 0;
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
          value={sk.template ?? ''}
          onChange={(e) =>
            dispatch({ type: 'sketch/set', patch: { template: e.currentTarget.value } })
          }
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
        <Button
          size="compact-xs"
          variant="default"
          leftSection={<PlayIcon />}
          disabled={!pitches}
          onClick={() => audio.playCents(cents)}
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
                  template: sk.template,
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
            lab.setChord(found);
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
      <span className={classes.hint}>
        {sk.armed ? 'Armed from a chord. ' : ''}Point at any note and hold 4 to hear this chord on
        it.
      </span>
    </div>
  );
}
