import { useState } from 'react';
import { Button, Group, Select } from '@mantine/core';
import { playArpeggio, playChord, playIntervalPairs, type Timbre } from '../sonify';

interface PlaybackControlsProps {
  pitches: number[];
  endpoints: Array<[number, number]>;
  baseMidi: number;
  edoSteps: number;
}

const TIMBRE_OPTIONS: Array<{ value: Timbre; label: string }> = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'piano', label: 'Piano' },
  { value: 'guitar', label: 'Guitar' },
];

export function PlaybackControls({ pitches, endpoints, baseMidi, edoSteps }: PlaybackControlsProps) {
  const [timbre, setTimbre] = useState<Timbre>('sine');
  const disabled = pitches.length === 0;
  return (
    <Group gap="xs" align="center">
      <Select
        size="xs"
        w={110}
        data={TIMBRE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))}
        value={timbre}
        onChange={(value) => setTimbre((value as Timbre) ?? 'sine')}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
      />
      <Button
        size="xs"
        variant="light"
        disabled={disabled}
        onClick={() => playArpeggio(pitches, baseMidi, edoSteps, timbre)}
      >
        Play arpeggio
      </Button>
      <Button
        size="xs"
        variant="light"
        disabled={disabled}
        onClick={() => playChord(pitches, baseMidi, edoSteps, timbre)}
      >
        Play chord
      </Button>
      <Button
        size="xs"
        variant="light"
        disabled={endpoints.length === 0}
        onClick={() => playIntervalPairs(endpoints, baseMidi, edoSteps, timbre)}
      >
        Play interval pairs
      </Button>
    </Group>
  );
}
