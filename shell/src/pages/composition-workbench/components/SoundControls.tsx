import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Popover,
  Select,
  Stack,
  Switch,
  Text,
  Tooltip,
} from '@mantine/core';
import { useAudioEngine } from '../audio/AudioEngineProvider';
import { midiNoteName } from '../interference';
import {
  formatOffset,
  resolveSound,
  soundLabel,
  soundTypeOptions,
  voiceNames,
  voiceSound,
  type SoundOverride,
  type SoundSet,
  type SoundType,
} from '../sounds';

const noteOptions = Array.from({ length: 88 }, (_, index) => {
  const note = index + 21;
  return { value: String(note), label: midiNoteName(note) };
});

/** A written pitch: a note plus a cents detune, stored as MIDI cents. */
export function PitchField({
  label,
  value,
  onChange,
  inPopover = false,
}: {
  label: string;
  value: number;
  onChange(midicents: number): void;
  inPopover?: boolean;
}) {
  const note = Math.round(value / 100);
  const cents = Math.round(value - note * 100);
  return (
    <Group gap={6} wrap="nowrap" align="end">
      <Select
        size="xs"
        label={label}
        searchable
        w={96}
        data={noteOptions}
        value={String(note)}
        allowDeselect={false}
        comboboxProps={{ withinPortal: !inPopover }}
        onChange={(next) => next && onChange(Number(next) * 100 + cents)}
      />
      <NumberInput
        size="xs"
        aria-label={`${label} cents`}
        w={78}
        suffix="¢"
        min={-50}
        max={50}
        clampBehavior="strict"
        value={cents}
        onChange={(next) => typeof next === 'number' && onChange(note * 100 + next)}
      />
    </Group>
  );
}

/** An offset from the base pitch: semitones plus cents, stored as cents. */
function OffsetField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange(cents: number): void;
}) {
  const semitones = Math.trunc(value / 100);
  const cents = Math.round(value - semitones * 100);
  return (
    <Group gap={6} wrap="nowrap">
      <NumberInput
        size="xs"
        aria-label={`${label} semitones`}
        w={84}
        suffix=" st"
        min={-48}
        max={48}
        clampBehavior="strict"
        allowDecimal={false}
        value={semitones}
        onChange={(next) => typeof next === 'number' && onChange(next * 100 + cents)}
      />
      <NumberInput
        size="xs"
        aria-label={`${label} cents`}
        w={78}
        suffix="¢"
        min={-99}
        max={99}
        clampBehavior="strict"
        allowDecimal={false}
        value={cents}
        onChange={(next) => typeof next === 'number' && onChange(semitones * 100 + next)}
      />
    </Group>
  );
}

function useAudition() {
  const engine = useAudioEngine();
  return (sound: SoundOverride) => {
    const { instrumentId, pitchMidicents } = resolveSound(sound.type, sound.midicents);
    void engine.play({
      plan: {
        id: 'sound-audition',
        sourceId: 'sound-audition',
        warnings: [],
        timebase: { kind: 'seconds' },
        durationSeconds: 0.5,
        events: [
          {
            id: 'sound-audition:hit',
            atSeconds: 0,
            durationSeconds: 0.25,
            pitchMidicents,
            velocity: 0.8,
            instrumentId,
            busId: 'preview',
            provenance: [],
          },
        ],
      },
      busGains: { preview: 0.3 },
    });
  };
}

function AuditionButton({ label, sound }: { label: string; sound: SoundOverride }) {
  const audition = useAudition();
  return (
    <Tooltip label={`Hear ${label.toLowerCase()} (${soundLabel(sound)})`}>
      <ActionIcon
        variant="subtle"
        size="sm"
        aria-label={`Hear ${label}`}
        onClick={() => audition(sound)}
      >
        ▶
      </ActionIcon>
    </Tooltip>
  );
}

/** Settings-panel editor for one voice set: base pitch, then each voice's sound and offset. */
export function SoundSetEditor({
  name,
  set,
  onChange,
}: {
  name: string;
  set: SoundSet;
  onChange(set: SoundSet): void;
}) {
  const updateVoice = (index: number, patch: Partial<SoundSet['voices'][number]>) =>
    onChange({
      ...set,
      voices: set.voices.map((voice, voiceIndex) =>
        voiceIndex === index ? { ...voice, ...patch } : voice
      ) as SoundSet['voices'],
    });
  return (
    <Stack gap="xs">
      <PitchField
        label={`${name} base pitch`}
        value={set.baseMidicents}
        onChange={(baseMidicents) => onChange({ ...set, baseMidicents })}
      />
      {set.voices.map((voice, index) => (
        <div key={voiceNames[index]}>
          <Group gap={6} wrap="nowrap" align="end">
            <Select
              size="xs"
              w={112}
              label={voiceNames[index]}
              aria-label={`${name} ${voiceNames[index].toLowerCase()} sound`}
              data={soundTypeOptions}
              value={voice.type}
              allowDeselect={false}
              onChange={(type) => type && updateVoice(index, { type: type as SoundType })}
            />
            {index === 0 ? (
              <Text size="xs" c="dimmed" pb={6} style={{ flex: 1 }}>
                at the base pitch
              </Text>
            ) : (
              <OffsetField
                label={`${name} ${voiceNames[index].toLowerCase()} offset`}
                value={voice.offsetCents}
                onChange={(offsetCents) => updateVoice(index, { offsetCents })}
              />
            )}
            <AuditionButton
              label={`${name} ${voiceNames[index].toLowerCase()} voice`}
              sound={voiceSound(set, index)}
            />
          </Group>
          {index > 0 && (
            <Text size="xs" c="dimmed" mt={2}>
              {formatOffset(voice.offsetCents)} → {soundLabel(voiceSound(set, index))}
            </Text>
          )}
        </div>
      ))}
    </Stack>
  );
}

/**
 * A module's sound for one layer: the global voice by default, or the module's own sound and
 * pitch. `value` null/undefined means "use the voice".
 */
export function SoundOverrideControl({
  label,
  set,
  voiceIndex,
  value,
  onChange,
}: {
  label: string;
  set: SoundSet;
  voiceIndex: number;
  value: SoundOverride | null | undefined;
  onChange(value: SoundOverride | null): void;
}) {
  const voiceName = voiceNames[voiceIndex % 3];
  const current = value ?? voiceSound(set, voiceIndex);
  return (
    <Popover position="bottom-start" withArrow shadow="md" width={260}>
      <Popover.Target>
        <Button
          size="compact-xs"
          variant={value ? 'light' : 'default'}
          aria-label={`${label} sound`}
          title={value ? soundLabel(value) : `${voiceName} voice (${soundLabel(current)})`}
          styles={{ label: { overflow: 'hidden', textOverflow: 'ellipsis' } }}
          maw="100%"
        >
          {value ? soundLabel(value) : `${voiceName} voice`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Switch
            size="xs"
            label={`Use the ${voiceName.toLowerCase()} voice from settings`}
            checked={!value}
            onChange={(event) =>
              onChange(event.currentTarget.checked ? null : voiceSound(set, voiceIndex))
            }
          />
          {value ? (
            <>
              <Select
                size="xs"
                label="Sound"
                data={soundTypeOptions}
                value={value.type}
                allowDeselect={false}
                comboboxProps={{ withinPortal: false }}
                onChange={(type) => type && onChange({ ...value, type: type as SoundType })}
              />
              <PitchField
                label="Pitch"
                value={value.midicents}
                inPopover
                onChange={(midicents) => onChange({ ...value, midicents })}
              />
            </>
          ) : (
            <Text size="xs" c="dimmed">
              Now: {soundLabel(current)}. Change voices in Workbench settings.
            </Text>
          )}
          <Group justify="flex-end">
            <AuditionButton label={label} sound={current} />
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
