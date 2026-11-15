/**
 * The subset rows of this generator: one mini tuner strip (a sparkline) per row, aligned to the tuner strip. Add puts the
 * current selection into the next new row with no name asked; click a row's name to rename it; hover previews, click on the
 * strip loads; delete removes. "All" also lists the rows of other generators (loading one switches this tab to that
 * generator). Subsets whose generator is gone sit in a collapsed "Unassigned" group at the bottom. The .scl export of the
 * current subset sits in the header.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Button, Checkbox, TextInput } from '@mantine/core';
import { analyzeSubset, resolveSubset, rotateSubset, toScl } from '../../../lib/harmonic-field';
import type { PreviewTarget } from '../audio/plan';
import { orphanSubsets, ownerLabel, type LibSubset } from '../state/generatorLibrary';
import { tabName } from '../state/labState';
import { CloseIcon, DownloadIcon, PlusIcon } from './icons';
import { NoteMark } from './NoteMark';
import { RefLines, stripLeft } from './TunerStrip';
import { Num, Strip, Tip, useLab } from './ui';
import classes from './lab.module.css';

/** A saved subset's notes as a scale: in degree order from its own mode root (the same repair the loader applies to a stored mode). */
function scaleOf(idx: readonly number[], mode: number): PreviewTarget {
  const m = Number.isInteger(mode) && mode >= 0 && mode < idx.length ? mode : 0;
  return { kind: 'scale', idx: [...idx.slice(m), ...idx.slice(0, m)] };
}

/** Hand a text to the browser as a file download. Never throws (a test or locked-down browser may lack the API). */
function download(name: string, text: string) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // no download available here
  }
}

const fileName = (s: string) => s.replace(/[^\w\- ]/g, '').trim() || 'subset';

/** The row's name and note count: click the name to rename it in place (Enter or leaving the box keeps it, Escape cancels). */
function NameCell({ saved, limit }: { saved: LibSubset; limit: number | null }) {
  const { dispatch } = useLab();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(saved.name);
  const done = (keep: boolean) => {
    if (keep && name.trim() && name.trim() !== saved.name) {
      dispatch({ type: 'subset/rename', id: saved.id, name });
    }
    setEditing(false);
  };
  if (editing) {
    return (
      <span className={classes.savedNameBtn} data-editing="true">
        <TextInput
          size="xs"
          aria-label="New name"
          value={name}
          data-autofocus
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setName(e.currentTarget.value)}
          onBlur={() => done(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              done(true);
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              done(false);
            }
          }}
        />
      </span>
    );
  }
  return (
    <Tip k="renameSaved" as="control">
      <button
        type="button"
        className={classes.savedNameBtn}
        aria-label={`Rename ${saved.name}`}
        onClick={() => {
          setName(saved.name);
          setEditing(true);
        }}
      >
        <span className={classes.savedName}>
          <span>{saved.name}</span>
          <Num muted>
            {saved.pitches.length} notes
            {limit ? ` · ${limit}-limit` : ''}
          </Num>
        </span>
      </button>
    </Tip>
  );
}

export function SavedSubsets() {
  const lab = useLab();
  const { state, tab, base, strip, dispatch, setPreview, storeFailed, audio } = lab;
  const { field, rep } = base;
  const { owner } = lab;
  const all = state.ui.savedAll;
  const lib = state.library;
  const [flash, setFlash] = useState<string | null>(null);
  const [orphansOpen, setOrphansOpen] = useState(false);
  const [goneLoad, setGoneLoad] = useState<object | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const orphanIds = useMemo(() => new Set(orphanSubsets(lib).map((s) => s.id)), [lib]);
  // the current generator's subsets re-resolve against this tab's field (a modified tab shows what still matches);
  // an orphan (its generator is gone) resolves the same way, since loading it applies it to this tab
  const rows = useMemo(
    () =>
      lib.subsets.map((s) => {
        const orphan = orphanIds.has(s.id);
        const same = s.owner === owner;
        const r = same || orphan ? resolveSubset(field, s) : null;
        const idx = r ? r.sel : null;
        const a = idx ? analyzeSubset(rotateSubset(field, idx, 0, rep), rep) : null;
        return { s, same, orphan, idx, mode: r ? r.mode : 0, limit: a?.primeLimit ?? null };
      }),
    [lib.subsets, orphanIds, owner, field, rep]
  );
  const shown = rows.filter((r) => !r.orphan && (r.same || all));
  const unassigned = rows.filter((r) => r.orphan);
  const current = useMemo(() => new Set(tab.sel), [tab.sel]);
  const hereCount = rows.filter((r) => r.same).length;
  const otherCount = rows.filter((r) => !r.orphan).length;

  // Add's row (or the duplicate it found) is highlighted briefly and scrolled into view
  const added = state.lastAdded;
  useEffect(() => {
    if (!added) {
      return;
    }
    setFlash(added.id);
    const el = listRef.current?.querySelector(`[data-subset="${added.id}"]`);
    if (el && 'scrollIntoView' in el) {
      (el as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
    const t = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(t);
  }, [added]);

  const exportScl = () => {
    if (!base.rel.length) {
      return;
    }
    const nm = fileName(tabName(tab));
    download(`${nm}.scl`, toScl(base.rel, rep, nm));
  };

  const loadNote = state.lastLoad;
  const loaded = loadNote ? lib.subsets.find((s) => s.id === loadNote.id) : undefined;

  const renderRow = ({ s, same, orphan, idx, mode, limit }: (typeof rows)[number]) => {
    const on = new Set(idx ?? []);
    const isLoaded =
      same && idx !== null && idx.length === current.size && idx.every((i) => current.has(i));
    // the saved subset's own mode root (the same repair the loader applies to a stored mode)
    const rootNote = idx && idx.length ? idx[mode] : null;
    const target = idx ? scaleOf(idx, mode) : null;
    const preview = () => {
      if (idx && target) {
        setPreview(idx);
        audio.setPreviewTarget(target);
      }
    };
    const unpreview = () => {
      setPreview(null);
      if (target) {
        audio.clearPreviewTarget(target);
      }
    };
    return (
      <li
        key={s.id}
        className={classes.savedItem}
        data-subset={s.id}
        data-flash={flash === s.id ? (added?.duplicate ? 'duplicate' : 'new') : undefined}
        onMouseEnter={preview}
        onMouseLeave={unpreview}
        onFocus={preview}
        onBlur={unpreview}
      >
        <Tip k="savedRow" as="control" block>
          <button
            type="button"
            className={classes.savedRow}
            aria-pressed={isLoaded}
            aria-label={`${s.name}: ${s.pitches.length} notes${same ? '' : orphan ? ', no generator' : ', another generator'}. Click to load.`}
            onClick={() => dispatch({ type: 'subset/load', id: s.id })}
          >
            <span aria-hidden="true" />
            {idx ? (
              <span className={classes.spark} aria-hidden="true">
                <RefLines thin />
                {field.map((n, i) => (
                  <span
                    key={i}
                    className={classes.sparkCol}
                    data-on={on.has(i)}
                    data-ratio={base.ratios[i]}
                    data-root={rootNote === i ? 'true' : undefined}
                    data-dir={strip.devs[i].dev >= 0 ? 'sharp' : 'flat'}
                    style={{ left: stripLeft(n.c, base.repC) }}
                  >
                    <NoteMark
                      dev={strip.devs[i].dev}
                      height={30}
                      mid={15}
                      half={9}
                      maxTaper={6}
                      showError={on.has(i)}
                      root={rootNote === i}
                      rootScale={0.4}
                    />
                  </span>
                ))}
              </span>
            ) : (
              <span className={classes.sparkOther}>{ownerLabel(lib, s.owner)}</span>
            )}
          </button>
        </Tip>
        <NameCell saved={s} limit={limit} />
        <span className={classes.savedActions}>
          <Tip k="deleteSaved" as="control">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="xs"
              aria-label={`Delete ${s.name}`}
              onClick={() => dispatch({ type: 'subset/delete', id: s.id })}
            >
              <CloseIcon />
            </ActionIcon>
          </Tip>
        </span>
      </li>
    );
  };

  return (
    <section className={classes.saved} aria-label="Saved subsets">
      <Strip title={<Tip k="savedSubsets">Saved subsets</Tip>}>
        <Num muted>
          {hereCount}
          {all && otherCount > hereCount ? ` of ${otherCount}` : ''}
        </Num>
        <Tip k="savedAll" as="control">
          <Checkbox
            size="xs"
            label="All"
            checked={all}
            onChange={(e) => dispatch({ type: 'ui', patch: { savedAll: e.currentTarget.checked } })}
          />
        </Tip>
        <Tip k="addSubset" as="control">
          <Button
            size="compact-xs"
            variant="default"
            aria-label="Add subset"
            leftSection={<PlusIcon />}
            disabled={tab.sel.length === 0}
            onClick={() => dispatch({ type: 'subset/add' })}
          >
            Add
          </Button>
        </Tip>
        <Tip k="exportScl" as="control">
          <ActionIcon
            variant="default"
            size="sm"
            aria-label="Export .scl"
            disabled={base.rel.length === 0}
            onClick={exportScl}
          >
            <DownloadIcon />
          </ActionIcon>
        </Tip>
      </Strip>
      <ul ref={listRef} className={classes.savedList} aria-label="Saved subsets list">
        {storeFailed && (
          <li className={classes.savedEmpty} role="alert">
            Not stored (storage full or blocked): saved subsets will be lost on reload.
          </li>
        )}
        {loadNote && loadNote.missing > 0 && loaded && loadNote !== goneLoad && (
          <li className={classes.savedEmpty} role="status">
            <span className={classes.noticeLine}>
              <span className={classes.fieldMsg} data-kind="warn">
                {`'${loaded.name}' loaded: ${loadNote.missing} of ${loadNote.found + loadNote.missing} pitches are not in this field.`}
              </span>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="xs"
                aria-label="Dismiss message"
                onClick={() => setGoneLoad(loadNote)}
              >
                <CloseIcon />
              </ActionIcon>
            </span>
          </li>
        )}
        {shown.length === 0 && unassigned.length === 0 && (
          <li className={classes.savedEmpty}>
            {otherCount === 0
              ? 'No subsets yet. Select some notes and press Add.'
              : 'None for this generator. Tick All to see the others.'}
          </li>
        )}
        {shown.length === 0 && unassigned.length > 0 && (
          <li className={classes.savedEmpty}>No subsets for this generator yet.</li>
        )}
        {shown.map(renderRow)}
        {unassigned.length > 0 && (
          <>
            <li className={classes.savedGroup}>
              <Tip k="unassigned" as="control" block>
                <button
                  type="button"
                  className={classes.savedGroupBtn}
                  aria-expanded={orphansOpen}
                  onClick={() => setOrphansOpen((o) => !o)}
                >
                  <span aria-hidden="true">{orphansOpen ? '▾' : '▸'}</span> Unassigned (
                  {unassigned.length})
                </button>
              </Tip>
            </li>
            {orphansOpen && unassigned.map(renderRow)}
          </>
        )}
      </ul>
    </section>
  );
}
