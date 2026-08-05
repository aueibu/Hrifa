import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Accordion,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { Data } from '../components/Data/Data';
import {
  type DerivationResult,
  defaultWordsA,
  defaultWordsB,
  deriveUsernameFromDate,
  formatTimestamp,
  loadSavedLists,
  parseWordList,
  savedListsKey,
} from '../lib/usernameSeeds';

type Mode = 'live' | 'frozen' | 'manual';

const modeLabel: Record<Mode, string> = {
  live: 'Live local time',
  frozen: 'Frozen result',
  manual: 'Manual test time',
};

export function UsernameSeedsPage() {
  const saved = loadSavedLists();
  const [wordsA, setWordsA] = useState(saved?.wordsA ?? defaultWordsA);
  const [wordsB, setWordsB] = useState(saved?.wordsB ?? defaultWordsB);
  const [mode, setMode] = useState<Mode>('live');
  const [displayDate, setDisplayDate] = useState(() => new Date());
  const [manualTime, setManualTime] = useState('');
  const [wordsAInput, setWordsAInput] = useState(
    saved?.wordsA.join('\n') ?? defaultWordsA.join('\n')
  );
  const [wordsBInput, setWordsBInput] = useState(
    saved?.wordsB.join('\n') ?? defaultWordsB.join('\n')
  );
  const [configError, setConfigError] = useState<string | null>(null);
  const [editorStatus, setEditorStatus] = useState('');
  const [copyLabel, setCopyLabel] = useState('Copy username');
  const [copyStatus, setCopyStatus] = useState('');
  const copyResetTimeout = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (mode !== 'live') {
      return;
    }
    const tick = () => setDisplayDate(new Date());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [mode]);

  useEffect(() => () => window.clearTimeout(copyResetTimeout.current), []);

  const result: DerivationResult | null =
    wordsA.length && wordsB.length ? deriveUsernameFromDate(displayDate, wordsA, wordsB) : null;

  function resumeLiveMode() {
    setMode('live');
    setDisplayDate(new Date());
  }

  function toggleFreeze() {
    if (mode === 'frozen') {
      resumeLiveMode();
    } else {
      setDisplayDate(new Date());
      setMode('frozen');
    }
  }

  function testManualTime() {
    const [hours, minutes] = manualTime.split(':').map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
      return;
    }
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    setDisplayDate(date);
    setMode('manual');
  }

  function applyLists() {
    const nextWordsA = parseWordList(wordsAInput);
    const nextWordsB = parseWordList(wordsBInput);
    if (nextWordsA.length === 0 || nextWordsB.length === 0) {
      setConfigError('Both A and B lists must contain at least one word.');
      return;
    }
    setWordsA(nextWordsA);
    setWordsB(nextWordsB);
    try {
      localStorage.setItem(
        savedListsKey,
        JSON.stringify({ wordsA: nextWordsA, wordsB: nextWordsB })
      );
      setEditorStatus(
        `Saved ${nextWordsA.length} A words and ${nextWordsB.length} B words in this browser.`
      );
    } catch {
      setEditorStatus('Applied the lists, but this browser could not save them.');
    }
    setConfigError(null);
    resumeLiveMode();
  }

  function restoreDefaultLists() {
    setWordsA(defaultWordsA);
    setWordsB(defaultWordsB);
    setWordsAInput(defaultWordsA.join('\n'));
    setWordsBInput(defaultWordsB.join('\n'));
    try {
      localStorage.removeItem(savedListsKey);
    } catch {
      // Defaults still apply for this page.
    }
    setConfigError(null);
    setEditorStatus('Built-in word lists restored and local saved lists removed.');
    resumeLiveMode();
  }

  async function copyUsername() {
    if (!result) {
      return;
    }
    const value = result.username;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.append(area);
        area.select();
        if (!document.execCommand('copy')) {
          throw new Error('Copy command failed');
        }
        area.remove();
      }
      setCopyLabel('Copied');
      setCopyStatus('Username copied.');
      copyResetTimeout.current = window.setTimeout(() => setCopyLabel('Copy username'), 1400);
    } catch {
      setCopyStatus('Unable to copy the username. Select it and copy manually.');
    }
  }

  return (
    <Stack maw={520} mx="auto" p="md" gap="lg">
      <Anchor component={Link} to="/" size="sm">
        &larr; Back to workbench
      </Anchor>

      <Stack gap={0}>
        <Title order={1} size="h1">
          Time-Derived Username
        </Title>
        <Text c="dimmed">A name from this moment's place in a repeating three-hour cycle.</Text>
      </Stack>

      {configError && (
        <Alert color="red" title="Configuration error">
          {configError}
        </Alert>
      )}

      {result && (
        <>
          <Card withBorder padding="lg" radius="md">
            <Badge variant="light" mb="sm">
              {modeLabel[mode]}
            </Badge>
            <Text fz="3rem" fw="bold">
              {result.username}
            </Text>
            <Text size="sm" c="dimmed">
              {mode === 'frozen'
                ? `Frozen at: ${formatTimestamp(displayDate)}`
                : `Local time: ${formatTimestamp(displayDate)}`}
            </Text>
          </Card>

          <Table>
            <Table.Tbody>
              <Table.Tr>
                <Table.Th>Minutes since midnight</Table.Th>
                <Table.Td>
                  <Data>{result.minutesSinceMidnight}</Data>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>Flat index</Table.Th>
                <Table.Td>
                  <Data>{result.flatIndex}</Data>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>A index</Table.Th>
                <Table.Td>
                  <Data>{result.aIndex}</Data>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>B index</Table.Th>
                <Table.Td>
                  <Data>{result.bIndex}</Data>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>Words</Table.Th>
                <Table.Td>
                  <Data>
                    {result.wordA} + {result.wordB}
                  </Data>
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>

          <Group>
            <Button onClick={copyUsername}>{copyLabel}</Button>
            <Button variant="default" onClick={toggleFreeze}>
              {mode === 'frozen' ? 'Resume' : 'Freeze'}
            </Button>
          </Group>
          <VisuallyHidden aria-live="polite">{copyStatus}</VisuallyHidden>
        </>
      )}

      <Accordion variant="separated">
        <Accordion.Item value="test-time">
          <Accordion.Control>Test another time</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <TextInput
                type="time"
                label="Time"
                value={manualTime}
                onChange={(event) => setManualTime(event.currentTarget.value)}
              />
              <Group>
                <Button onClick={testManualTime}>Test time</Button>
                <Button variant="default" onClick={resumeLiveMode}>
                  Return to live time
                </Button>
              </Group>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="edit-lists">
          <Accordion.Control>Edit word lists</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                Changes are saved only in this browser on this device. They are not transmitted.
              </Text>
              <Textarea
                label="A words"
                description="One per line or comma-separated"
                rows={5}
                value={wordsAInput}
                onChange={(event) => setWordsAInput(event.currentTarget.value)}
              />
              <Textarea
                label="B words"
                description="One per line or comma-separated"
                rows={6}
                value={wordsBInput}
                onChange={(event) => setWordsBInput(event.currentTarget.value)}
              />
              <Group>
                <Button onClick={applyLists}>Save and apply lists</Button>
                <Button variant="default" onClick={restoreDefaultLists}>
                  Restore defaults
                </Button>
              </Group>
              {editorStatus && (
                <Text size="sm" c="dimmed">
                  {editorStatus}
                </Text>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Text size="xs" c="dimmed">
        Generated locally in your browser. No data is transmitted.
      </Text>
    </Stack>
  );
}
