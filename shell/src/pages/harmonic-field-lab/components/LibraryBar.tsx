/**
 * Under the Preset control (M7b step 2): the split button (Update preset | Save as new | its dropdown), the Update / copy
 * notice with Undo and Show removed, and the refusal line. Everything goes through the library actions of the lab state.
 */
import { useMemo, useState } from 'react';
import { ActionIcon, Button, Menu, Modal, Popover, TextInput } from '@mantine/core';
import { listFolders, reportSentence } from '../../../lib/harmonic-field';
import { autoName } from '../state/generate';
import { subsetsOf } from '../state/generatorLibrary';
import { copySentence, forkSentence } from '../state/noticeText';
import { ownerPath } from '../state/presetTree';
import { CloseIcon } from './icons';
import { FolderInput } from './PresetBrowser';
import { RefLines, stripLeft } from './TunerStrip';
import { Num, Tip, useLab } from './ui';
import classes from './lab.module.css';

export function LibraryActions() {
  const { state, tab, owner, modified, canUpdate, updateBlocker, dispatch } = useLab();
  const lib = state.library;
  const [formOpen, setFormOpen] = useState(false);
  const [copy, setCopy] = useState(false);
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const folders = useMemo(() => listFolders(lib.presets.map((p) => p.folder)), [lib.presets]);
  const mine = owner ? subsetsOf(lib, owner).length : 0;
  // naming an unmodified Auto-saved generator promotes it: its subsets move with it (the reducer's rule)
  const promoting = !!owner && owner.startsWith('u:') && !modified;
  const start = (withCopy: boolean) => {
    setCopy(withCopy);
    setName('');
    setFormOpen(true);
  };
  const save = () => {
    dispatch({ type: 'preset/save', name, folder, copySubsets: copy });
    setFormOpen(false);
  };
  return (
    <div className={classes.libBar}>
      <Tip k="presetUpdate" as="control" extra={updateBlocker ?? undefined}>
        <Button
          size="compact-xs"
          variant="default"
          disabled={!canUpdate}
          onClick={() => dispatch({ type: 'preset/update' })}
        >
          Update preset
        </Button>
      </Tip>
      <Popover
        opened={formOpen}
        onChange={setFormOpen}
        position="bottom-start"
        width={264}
        transitionProps={{ duration: 0 }}
      >
        <Popover.Target>
          <span className={classes.libSplit}>
            <Tip k="presetSaveNew" as="control">
              <Button
                size="compact-xs"
                variant="default"
                className={classes.libSaveMain}
                onClick={(e) => start(e.shiftKey)}
              >
                Save as new
              </Button>
            </Tip>
            <Menu position="bottom-end" transitionProps={{ duration: 0 }}>
              <Menu.Target>
                <Button
                  size="compact-xs"
                  variant="default"
                  className={classes.libSaveMore}
                  aria-label="More ways to save as new"
                >
                  <span aria-hidden="true">&#9662;</span>
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => start(false)}>Save as new, empty subset list</Menu.Item>
                <Menu.Item onClick={() => start(true)} disabled={mine === 0}>
                  Save as new, copy {mine} subset{mine === 1 ? '' : 's'} (Shift+click)
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </span>
        </Popover.Target>
        <Popover.Dropdown>
          <div className={classes.formStack}>
            <TextInput
              size="xs"
              aria-label="New preset name"
              placeholder={autoName(tab.gen)}
              data-autofocus
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  save();
                }
              }}
            />
            <FolderInput value={folder} onChange={setFolder} suggestions={folders} onEnter={save} />
            <span className={classes.paramNote} role="status">
              {promoting
                ? `Names this Auto-saved generator; its ${mine} subset${mine === 1 ? '' : 's'} move with it.`
                : copy
                  ? `Copies ${mine} subset${mine === 1 ? '' : 's'}, matched to this generator.`
                  : 'Starts with no subsets.'}
            </span>
            <span className={classes.inline}>
              <Button size="xs" variant="default" onClick={save}>
                Save
              </Button>
              <Button size="xs" variant="subtle" color="gray" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
            </span>
          </div>
        </Popover.Dropdown>
      </Popover>
    </div>
  );
}

/** The review list behind Show removed: each affected subset as a strip, surviving pitches solid, removed ones dashed. */
function RemovedReview() {
  const { state, base } = useLab();
  const n = state.notice;
  const [open, setOpen] = useState(false);
  if (!n || n.report.detail.length === 0) {
    return null;
  }
  return (
    <>
      <Tip k="presetShowRemoved" as="control">
        <Button size="compact-xs" variant="default" onClick={() => setOpen(true)}>
          Show removed
        </Button>
      </Tip>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title="Subsets that lost pitches"
        size="min(40rem, 94vw)"
        centered
        closeButtonProps={{ 'aria-label': 'Close' }}
        transitionProps={{ duration: 0 }}
      >
        <ul className={classes.revList} aria-label="Subsets that lost pitches">
          {n.report.detail.map((d) => (
            <li key={d.id} className={classes.revItem}>
              <span className={classes.savedName}>
                <span>{d.name}</span>
                <Num muted>
                  {d.removed ? 'removed' : `kept ${d.kept.length}, lost ${d.lost.length}`}
                </Num>
              </span>
              <span
                className={classes.spark}
                role="img"
                aria-label={`${d.name}: ${d.kept.length} pitches kept (solid), ${d.lost.length} removed (dashed)`}
              >
                <RefLines thin />
                {d.kept.map((p, i) => (
                  <span
                    key={`k${i}`}
                    className={classes.revMark}
                    data-kind="kept"
                    style={{ left: stripLeft(p.c, base.repC) }}
                  />
                ))}
                {d.lost.map((p, i) => (
                  <span
                    key={`l${i}`}
                    className={classes.revMark}
                    data-kind="lost"
                    style={{ left: stripLeft(p.c, base.repC) }}
                  />
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

export function LibraryNotice() {
  const { state, dispatch } = useLab();
  const n = state.notice;
  const [gone, setGone] = useState<object | null>(null);
  const [goneFork, setGoneFork] = useState<object | null>(null);
  const refusal = state.refusal;
  const fork = state.forkNote;
  return (
    <>
      {fork && fork !== goneFork && (
        <div className={classes.notice} role="status" data-kind="fork">
          <span>{forkSentence(ownerPath(state.library, fork.owner).at(-1) ?? 'Auto-saved')}</span>
          <span className={classes.noticeActions}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="xs"
              aria-label="Dismiss fork notice"
              onClick={() => setGoneFork(fork)}
            >
              <CloseIcon />
            </ActionIcon>
          </span>
        </div>
      )}
      {refusal && refusal !== gone && (
        <span className={classes.noticeLine}>
          <span className={classes.fieldMsg} data-kind="err" role="alert">
            {refusal.reason}
          </span>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="xs"
            aria-label="Dismiss message"
            onClick={() => setGone(refusal)}
          >
            <CloseIcon />
          </ActionIcon>
        </span>
      )}
      {n && (
        <div className={classes.notice} role="status" data-kind={n.kind}>
          <span>
            {n.kind === 'update'
              ? reportSentence(n.name, n.report)
              : copySentence(n.name, n.report)}
          </span>
          <span className={classes.noticeActions}>
            {n.undo && (
              <Tip k="presetUndo" as="control">
                <Button
                  size="compact-xs"
                  variant="default"
                  onClick={() => dispatch({ type: 'notice/undo' })}
                >
                  Undo
                </Button>
              </Tip>
            )}
            <RemovedReview />
            <ActionIcon
              variant="subtle"
              color="gray"
              size="xs"
              aria-label="Dismiss notice"
              onClick={() => dispatch({ type: 'notice/dismiss' })}
            >
              <CloseIcon />
            </ActionIcon>
          </span>
        </div>
      )}
    </>
  );
}
