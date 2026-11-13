/** Top bar: title, tunings (tabs), glossary, colour scheme; second row: global audio controls (static in the mock). */
import { Link } from 'react-router-dom';
import {
  Anchor,
  Button,
  Checkbox,
  Group,
  NativeSelect,
  NumberInput,
  Slider,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { ColorSchemeToggle } from '../../../components/ColorSchemeToggle/ColorSchemeToggle';
import { BookIcon, KeyboardIcon } from './icons';
import { Tip } from './ui';
import classes from './mock.module.css';

const TABS = ['Harmonics 8–15', '19-EDO', 'Ellis duodene'];

interface Props {
  onGlossary: () => void;
  dockOpen: boolean;
  onDock: () => void;
}

export function TopBar({ onGlossary, dockOpen, onDock }: Props) {
  return (
    <>
      <div className={classes.bar1}>
        <Group gap="sm" wrap="nowrap">
          <Anchor component={Link} to="/" size="sm">
            &larr; Home
          </Anchor>
          <Text c="dimmed">/</Text>
          <Title order={1} size="h4" className={classes.pageTitle}>
            Harmonic Field Lab
          </Title>
          <Text size="xs" c="dimmed" className={classes.mockTag}>
            layout mock
          </Text>
        </Group>
        <Tip k="tabs" as="control">
          <Tabs value={TABS[0]} variant="default" aria-label="Tunings" className={classes.tabs}>
            <Tabs.List>
              {TABS.map((t) => (
                <Tabs.Tab key={t} value={t}>
                  {t}
                </Tabs.Tab>
              ))}
              <Tabs.Tab value="+" aria-label="New tuning">
                +
              </Tabs.Tab>
            </Tabs.List>
          </Tabs>
        </Tip>
        <Group gap="xs" wrap="nowrap">
          <Tip k="glossary" as="control">
            <Button variant="default" size="xs" leftSection={<BookIcon />} onClick={onGlossary}>
              Glossary
            </Button>
          </Tip>
          <ColorSchemeToggle />
        </Group>
      </div>

      <div className={classes.bar2} role="group" aria-label="Sound">
        <Group gap="lg" wrap="nowrap" className={classes.transport}>
          <Group gap="xs" wrap="nowrap">
            <Tip k="wave">Wave</Tip>
            <Tip k="wave" as="control">
              <NativeSelect
                size="xs"
                aria-label="Wave"
                data={['Sine', 'Saw']}
                defaultValue="Sine"
                w={84}
              />
            </Tip>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Tip k="baseHz">1/1 Hz</Tip>
            <Tip k="baseHz" as="control">
              <NumberInput
                size="xs"
                aria-label="1/1 Hz"
                defaultValue={261.6256}
                decimalScale={4}
                hideControls
                w={96}
              />
            </Tip>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Tip k="volume">Vol</Tip>
            <Tip k="volume" as="control">
              <Slider size="xs" w={96} defaultValue={50} label={null} aria-label="Volume" />
            </Tip>
          </Group>
          <Tip k="modeAtBase" as="control">
            <Checkbox size="xs" defaultChecked label="Mode root at 1/1 Hz" />
          </Tip>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Tip k="playScale" as="control">
            <Button size="xs" variant="default">
              Play scale
            </Button>
          </Tip>
          <Tip k="playChord" as="control">
            <Button size="xs" variant="default">
              Play chord
            </Button>
          </Tip>
          <Tip k="stop" as="control">
            <Button size="xs" variant="default">
              Stop
            </Button>
          </Tip>
          <Tip k="keyboardDock" as="control">
            <Button
              size="xs"
              variant="default"
              leftSection={<KeyboardIcon />}
              aria-pressed={dockOpen}
              onClick={onDock}
              className={classes.viewToggle}
              data-on={dockOpen}
            >
              Keyboard
            </Button>
          </Tip>
        </Group>
      </div>
    </>
  );
}
