import { ActionIcon, Button, Group, Select, Stack, Text } from '@mantine/core';
import { SARGAM_DEGREES, type SargamDegree, type TanpuraNote } from '../settings';

export interface TanpuraSequenceEditorProps {
  value: TanpuraNote[];
  onChange: (next: TanpuraNote[]) => void;
}

const OCTAVE_OPTIONS = [
  { value: '-1', label: 'Low' },
  { value: '0', label: 'Own' },
  { value: '1', label: 'High' },
];

/** An ordered editor for the tanpura's own string sequence: which sargam degree each string is tuned to, its
 * octave, and the order they're plucked in (a real tanpura's cycle is a fixed, meaningful order, not a set). */
export function TanpuraSequenceEditor({ value, onChange }: TanpuraSequenceEditorProps) {
  const set = (i: number, patch: Partial<TanpuraNote>) =>
    onChange(value.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) {
      return;
    }
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => onChange([...value, { degree: 'S', octave: 0 }]);

  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        Tanpura string sequence
      </Text>
      <Text size="xs" c="dimmed">
        Order matters -- this is the pluck cycle, not just a set of notes.
      </Text>
      {value.map((n, i) => (
        <Group key={i} gap={6} wrap="nowrap">
          <Text size="xs" c="dimmed" w={16}>
            {i + 1}
          </Text>
          <Select
            size="xs"
            data={SARGAM_DEGREES}
            value={n.degree}
            onChange={(v) => v && set(i, { degree: v as SargamDegree })}
            allowDeselect={false}
            style={{ flex: 1 }}
          />
          <Select
            size="xs"
            data={OCTAVE_OPTIONS}
            value={String(n.octave)}
            onChange={(v) => v && set(i, { octave: Number(v) as TanpuraNote['octave'] })}
            allowDeselect={false}
            style={{ width: 80 }}
          />
          <ActionIcon
            size="sm"
            variant="subtle"
            disabled={i === 0}
            onClick={() => move(i, -1)}
            aria-label="Move up"
          >
            &uarr;
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="subtle"
            disabled={i === value.length - 1}
            onClick={() => move(i, 1)}
            aria-label="Move down"
          >
            &darr;
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="red"
            disabled={value.length <= 1}
            onClick={() => remove(i)}
            aria-label="Remove string"
          >
            &times;
          </ActionIcon>
        </Group>
      ))}
      <Button size="xs" variant="light" onClick={add} style={{ alignSelf: 'flex-start' }}>
        + Add string
      </Button>
    </Stack>
  );
}
