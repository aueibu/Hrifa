/** Top bar, one thin row: back link, title, tuning tabs, transport (scale, chord, stop), sound menu, glossary, scheme. */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ActionIcon,
  Button,
  Checkbox,
  NativeSelect,
  Popover,
  SegmentedControl,
  Slider,
  Text,
  TextInput,
} from '@mantine/core';
import { ColorSchemeToggle } from '../../../components/ColorSchemeToggle/ColorSchemeToggle';
import { MAX_TABS, WAVES, tabName, type Wave } from '../state/labState';
import { DeveloperMenu } from './DeveloperMenu';
import { BookIcon, CopyIcon, HomeIcon, PlayIcon, PlusIcon, SoundIcon, StopIcon } from './icons';
import { CommitNumber, Tip, useLab } from './ui';
import classes from './lab.module.css';

const WAVE_LABEL: Record<Wave, string> = { sine: 'Sine', harmonic: 'Harmonic (7 partials)' };

/** One tab: a button that switches, double-click to rename (empty goes back to the automatic name), a close mark. */
function TabButton({ index }: { index: number }) {
  const { state, dispatch } = useLab();
  const t = state.tabs[index];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    if (editing) {
      input.current?.select();
    }
  }, [editing]);
  const name = tabName(t);
  const commit = () => {
    setEditing(false);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (draft.trim() !== name) {
      dispatch({ type: 'tab/rename', index, name: draft });
    }
  };
  if (editing) {
    return (
      <span className={classes.tabWrap}>
        <TextInput
          ref={input}
          size="xs"
          aria-label={`Rename tab ${name}`}
          value={draft}
          className={classes.tabInput}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit();
            } else if (e.key === 'Escape') {
              cancelled.current = true;
              setEditing(false);
            }
          }}
        />
      </span>
    );
  }
  return (
    <span className={classes.tabWrap}>
      <button
        type="button"
        role="tab"
        aria-selected={index === state.active}
        className={classes.tab}
        title={`${index < 9 ? `Alt+${index + 1}: ` : ''}double-click to rename`}
        onClick={() => dispatch({ type: 'tab/switch', index })}
        onDoubleClick={() => {
          setDraft(name);
          cancelled.current = false;
          setEditing(true);
        }}
      >
        {name}
      </button>
      {state.tabs.length > 1 && (
        <button
          type="button"
          className={classes.tabClose}
          aria-label={`Close ${name}`}
          onClick={() => dispatch({ type: 'tab/close', index })}
        >
          &times;
        </button>
      )}
    </span>
  );
}

export function TopBar({ onGlossary }: { onGlossary: () => void }) {
  const { state, dispatch, audio } = useLab();
  const { ui } = state;
  return (
    <div className={classes.topbar}>
      <Link to="/" className={classes.homeLink} aria-label="Home">
        <HomeIcon />
        <span className={classes.homeText}>Home</span>
      </Link>
      <h1 className={classes.pageTitle}>Harmonic Field Lab</h1>
      <Tip k="tabs" as="control">
        <div role="tablist" aria-label="Tunings" className={classes.tabs}>
          {state.tabs.map((t, i) => (
            <TabButton key={t.id} index={i} />
          ))}
          <Tip k="duplicateTab" as="control">
            <button
              type="button"
              className={classes.tab}
              aria-label="Duplicate tab"
              disabled={state.tabs.length >= MAX_TABS}
              onClick={() => dispatch({ type: 'tab/duplicate' })}
            >
              <CopyIcon />
            </button>
          </Tip>
          <button
            type="button"
            className={classes.tab}
            aria-label="New tuning"
            disabled={state.tabs.length >= MAX_TABS}
            onClick={() => dispatch({ type: 'tab/add' })}
          >
            <PlusIcon />
          </button>
        </div>
      </Tip>
      <span className={classes.grow} />
      <div className={classes.transport} role="group" aria-label="Transport">
        <Tip k="playScale" as="control">
          <Button
            size="compact-xs"
            variant="default"
            leftSection={<PlayIcon />}
            onClick={audio.playScale}
          >
            scale
          </Button>
        </Tip>
        <Tip k="playChord" as="control">
          <Button
            size="compact-xs"
            variant="default"
            leftSection={<PlayIcon />}
            onClick={audio.playChord}
          >
            chord
          </Button>
        </Tip>
        <Tip k="modePlayback" as="control">
          <SegmentedControl
            size="xs"
            aria-label="Mode playback"
            value={ui.modePlayback}
            onChange={(v) =>
              dispatch({
                type: 'ui',
                patch: { modePlayback: v === 'relative' ? 'relative' : 'parallel' },
              })
            }
            data={[
              { label: 'Parallel', value: 'parallel' },
              { label: 'Relative', value: 'relative' },
            ]}
          />
        </Tip>
        <Tip k="stop" as="control">
          <ActionIcon variant="default" size="sm" aria-label="Stop" onClick={audio.stopAll}>
            <StopIcon />
          </ActionIcon>
        </Tip>
      </div>
      <Tip k="soundMenu" as="control">
        <Popover position="bottom-end" width={240} transitionProps={{ duration: 0 }}>
          <Popover.Target>
            <ActionIcon variant="default" size="sm" aria-label="Sound settings">
              <SoundIcon />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown>
            <div className={classes.formStack}>
              <Tip k="wave" as="control" block>
                <NativeSelect
                  size="xs"
                  label="Wave"
                  data={WAVES.map((w) => ({ value: w, label: WAVE_LABEL[w] }))}
                  value={ui.wave}
                  onChange={(e) =>
                    dispatch({
                      type: 'ui',
                      patch: { wave: e.currentTarget.value === 'harmonic' ? 'harmonic' : 'sine' },
                    })
                  }
                />
              </Tip>
              <Tip k="baseHz" as="control" block>
                <CommitNumber
                  size="xs"
                  label="1/1 Hz"
                  value={ui.baseHz}
                  min={20}
                  max={5000}
                  allowDecimal
                  decimalScale={4}
                  hideControls
                  onCommit={(baseHz) => dispatch({ type: 'ui', patch: { baseHz } })}
                />
              </Tip>
              <Tip k="volume" as="control" block>
                <Text size="xs">Volume</Text>
                <Slider
                  size="xs"
                  value={Math.round(ui.volume * 100)}
                  onChange={(v) => dispatch({ type: 'ui', patch: { volume: v / 100 } })}
                  label={null}
                  aria-label="Volume"
                />
              </Tip>
              <Tip k="scalePreview" as="control" block>
                <Text size="xs">Scale preview</Text>
                <SegmentedControl
                  size="xs"
                  fullWidth
                  aria-label="Scale preview direction"
                  value={ui.scalePreview}
                  onChange={(v) =>
                    dispatch({
                      type: 'ui',
                      patch: { scalePreview: v === 'updown' ? 'updown' : 'up' },
                    })
                  }
                  data={[
                    { label: 'Up', value: 'up' },
                    { label: 'Up-down', value: 'updown' },
                  ]}
                />
              </Tip>
              <Tip k="modeAtBase" as="control" block>
                <Checkbox
                  size="xs"
                  checked={ui.modeAtBase}
                  onChange={(e) =>
                    dispatch({ type: 'ui', patch: { modeAtBase: e.currentTarget.checked } })
                  }
                  label="Mode root at 1/1 Hz"
                />
              </Tip>
            </div>
          </Popover.Dropdown>
        </Popover>
      </Tip>
      <DeveloperMenu />
      <Tip k="glossary" as="control">
        <Button variant="default" size="compact-xs" leftSection={<BookIcon />} onClick={onGlossary}>
          Glossary
        </Button>
      </Tip>
      <ColorSchemeToggle />
    </div>
  );
}
