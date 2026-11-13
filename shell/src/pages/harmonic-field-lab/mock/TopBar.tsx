/** Top bar, one thin row: back link, title, tuning tabs, transport (scale, chord, stop), sound menu, glossary, scheme. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ActionIcon,
  Button,
  Checkbox,
  NativeSelect,
  NumberInput,
  Popover,
  Slider,
  Text,
} from '@mantine/core';
import { ColorSchemeToggle } from '../../../components/ColorSchemeToggle/ColorSchemeToggle';
import { BookIcon, HomeIcon, PlayIcon, PlusIcon, SoundIcon, StopIcon } from './icons';
import { Tip } from './ui';
import classes from './mock.module.css';

const TABS = ['Harmonics 8–15', '19-EDO', 'Ellis duodene'];

export function TopBar({ onGlossary }: { onGlossary: () => void }) {
  const [tab, setTab] = useState(TABS[0]);
  return (
    <div className={classes.topbar}>
      <Link to="/" className={classes.homeLink} aria-label="Home">
        <HomeIcon />
        <span className={classes.homeText}>Home</span>
      </Link>
      <h1 className={classes.pageTitle}>Harmonic Field Lab</h1>
      <Tip k="tabs" as="control">
        <div role="tablist" aria-label="Tunings" className={classes.tabs}>
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={classes.tab}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
          <button type="button" className={classes.tab} aria-label="New tuning">
            <PlusIcon />
          </button>
        </div>
      </Tip>
      <span className={classes.grow} />
      <div className={classes.transport} role="group" aria-label="Transport">
        <Tip k="playScale" as="control">
          <Button size="compact-xs" variant="default" leftSection={<PlayIcon />}>
            scale
          </Button>
        </Tip>
        <Tip k="playChord" as="control">
          <Button size="compact-xs" variant="default" leftSection={<PlayIcon />}>
            chord
          </Button>
        </Tip>
        <Tip k="stop" as="control">
          <ActionIcon variant="default" size="sm" aria-label="Stop">
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
                <NativeSelect size="xs" label="Wave" data={['Sine', 'Saw']} defaultValue="Sine" />
              </Tip>
              <Tip k="baseHz" as="control" block>
                <NumberInput
                  size="xs"
                  label="1/1 Hz"
                  defaultValue={261.6256}
                  decimalScale={4}
                  hideControls
                />
              </Tip>
              <Tip k="volume" as="control" block>
                <Text size="xs">Volume</Text>
                <Slider size="xs" defaultValue={50} label={null} aria-label="Volume" />
              </Tip>
              <Tip k="modeAtBase" as="control" block>
                <Checkbox size="xs" defaultChecked label="Mode root at 1/1 Hz" />
              </Tip>
            </div>
          </Popover.Dropdown>
        </Popover>
      </Tip>
      <Tip k="glossary" as="control">
        <Button variant="default" size="compact-xs" leftSection={<BookIcon />} onClick={onGlossary}>
          Glossary
        </Button>
      </Tip>
      <ColorSchemeToggle />
    </div>
  );
}
