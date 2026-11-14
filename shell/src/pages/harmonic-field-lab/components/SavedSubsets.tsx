/**
 * Saved subsets of this pitch collection: one mini tuner strip (a sparkline) per row. Hover previews, click loads; a row
 * can be renamed or deleted. "All" also lists subsets saved on other collections (a row without a sparkline; loading one
 * switches this tab to that collection). The .scl export of the current subset sits in the header.
 */
import { useMemo, useState } from 'react';
import { ActionIcon, Button, Checkbox, Popover, TextInput } from '@mantine/core';
import { analyzeSubset, rotateSubset, toScl } from '../../../lib/harmonic-field';
import { autoName, genKey } from '../state/generate';
import { matchCents, tabName, type Saved } from '../state/labState';
import { CloseIcon, DownloadIcon, SaveIcon } from './icons';
import { NoteMark } from './NoteMark';
import { RefLines, stripLeft } from './TunerStrip';
import { Num, Strip, Tip, useLab } from './ui';
import classes from './lab.module.css';

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

function RenameButton({ saved }: { saved: Saved }) {
  const { dispatch } = useLab();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(saved.name);
  const done = () => {
    dispatch({ type: 'saved/rename', id: saved.id, name });
    setOpen(false);
  };
  return (
    <Popover
      opened={open}
      onChange={setOpen}
      position="bottom-end"
      width={220}
      transitionProps={{ duration: 0 }}
    >
      <Popover.Target>
        <Tip k="renameSaved" as="control">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="xs"
            aria-label={`Rename ${saved.name}`}
            onClick={() => {
              setName(saved.name);
              setOpen((o) => !o);
            }}
          >
            <span aria-hidden="true">&#9998;</span>
          </ActionIcon>
        </Tip>
      </Popover.Target>
      <Popover.Dropdown>
        <span className={classes.inline}>
          <TextInput
            size="xs"
            aria-label="New name"
            value={name}
            flex={1}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                done();
              }
            }}
          />
          <Button size="xs" variant="default" onClick={done}>
            Rename
          </Button>
        </span>
      </Popover.Dropdown>
    </Popover>
  );
}

export function SavedSubsets() {
  const { state, tab, base, strip, dispatch, setPreview, storeFailed } = useLab();
  const { field, rep } = base;
  const [name, setName] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const here = useMemo(() => genKey(tab.gen), [tab.gen]);
  const all = state.ui.savedAll;
  const rows = useMemo(
    () =>
      state.saved.map((s) => {
        const same = genKey(s.gen) === here;
        const idx = same ? matchCents(field, s.selCents) : null;
        const a = idx ? analyzeSubset(rotateSubset(field, idx, 0, rep), rep) : null;
        return { s, same, idx, limit: a?.primeLimit ?? null };
      }),
    [state.saved, here, field, rep]
  );
  const shown = rows.filter((r) => r.same || all);
  const current = useMemo(() => new Set(tab.sel), [tab.sel]);
  const hereCount = rows.filter((r) => r.same).length;
  const exportScl = () => {
    if (!base.rel.length) {
      return;
    }
    const nm = fileName(name || tabName(tab) || autoName(tab.gen));
    download(`${nm}.scl`, toScl(base.rel, rep, nm));
  };
  return (
    <section className={classes.saved} aria-label="Saved subsets">
      <Strip title={<Tip k="savedSubsets">Saved subsets</Tip>}>
        <Num muted>
          {hereCount}
          {all && rows.length > hereCount ? ` of ${rows.length}` : ''}
        </Num>
        <Tip k="savedAll" as="control">
          <Checkbox
            size="xs"
            label="All"
            checked={all}
            onChange={(e) => dispatch({ type: 'ui', patch: { savedAll: e.currentTarget.checked } })}
          />
        </Tip>
        <Tip k="saveSubset" as="control">
          <Popover
            opened={saveOpen}
            onChange={setSaveOpen}
            position="bottom-end"
            width={240}
            transitionProps={{ duration: 0 }}
          >
            <Popover.Target>
              <ActionIcon
                variant="default"
                size="sm"
                aria-label="Save current subset"
                onClick={() => setSaveOpen((o) => !o)}
              >
                <SaveIcon />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
              <div className={classes.formStack}>
                <span className={classes.inline}>
                  <TextInput
                    size="xs"
                    aria-label="Subset name"
                    placeholder="Name"
                    flex={1}
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                  />
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() => {
                      dispatch({ type: 'saved/save', name });
                      setName('');
                      setSaveOpen(false);
                    }}
                  >
                    Save
                  </Button>
                </span>
                {storeFailed && (
                  <span className={classes.fieldMsg} data-kind="err" role="alert">
                    Not stored (storage full or blocked): this subset will be lost on reload.
                  </span>
                )}
                <Checkbox
                  size="xs"
                  label="Include new notes when the field changes"
                  checked={tab.gen.keepNew}
                  onChange={(e) => dispatch({ type: 'gen/keepNew', on: e.currentTarget.checked })}
                />
              </div>
            </Popover.Dropdown>
          </Popover>
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
      <ul className={classes.savedList} aria-label="Saved subsets list">
        {storeFailed && (
          <li className={classes.savedEmpty} role="alert">
            Not stored (storage full or blocked): saved subsets will be lost on reload.
          </li>
        )}
        {shown.length === 0 && (
          <li className={classes.savedEmpty}>
            {rows.length === 0
              ? 'Nothing saved yet. Save the current subset with the disk button.'
              : 'None for this collection. Tick All to see the others.'}
          </li>
        )}
        {shown.map(({ s, same, idx, limit }) => {
          const on = new Set(idx ?? []);
          const loaded =
            same && idx !== null && idx.length === current.size && idx.every((i) => current.has(i));
          // the saved subset's own mode root (the same repair the loader applies to a stored mode)
          const rootNote =
            idx && idx.length
              ? idx[Number.isInteger(s.mode) && s.mode >= 0 && s.mode < idx.length ? s.mode : 0]
              : null;
          return (
            <li key={s.id} className={classes.savedItem}>
              <Tip k="savedRow" as="control" block>
                <button
                  type="button"
                  className={classes.savedRow}
                  aria-pressed={loaded}
                  aria-label={`${s.name}: ${s.selCents.length} notes${same ? '' : ', another collection'}. Click to load.`}
                  onMouseEnter={() => idx && setPreview(idx)}
                  onMouseLeave={() => setPreview(null)}
                  onFocus={() => idx && setPreview(idx)}
                  onBlur={() => setPreview(null)}
                  onClick={() => dispatch({ type: 'saved/load', id: s.id })}
                >
                  <span className={classes.savedName}>
                    <span>{s.name}</span>
                    <Num muted>
                      {s.selCents.length} notes
                      {limit ? ` · ${limit}-limit` : ''}
                    </Num>
                  </span>
                  {same ? (
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
                    <span className={classes.sparkOther}>{autoName(s.gen)}</span>
                  )}
                </button>
              </Tip>
              <span className={classes.savedActions}>
                <RenameButton saved={s} />
                <Tip k="deleteSaved" as="control">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="xs"
                    aria-label={`Delete ${s.name}`}
                    onClick={() => dispatch({ type: 'saved/delete', id: s.id })}
                  >
                    <CloseIcon />
                  </ActionIcon>
                </Tip>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
