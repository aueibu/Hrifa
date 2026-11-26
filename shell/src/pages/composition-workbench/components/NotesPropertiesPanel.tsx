import { useState } from 'react';
import { Stack, Text } from '@mantine/core';
import { TextInput, Button } from '../../../ui';
import type { PacketBlock } from '../dataBlock';
import { useDesk } from '../desk';
import { addRational, compareRational, subtractRational, type Rational } from '../musicalTime';
import {
  editNotesProperties,
  hasNotesProperties,
  readNotesProperties,
  type NotesProperties,
} from '../notesProperties';
import { isValidMeter } from '../transport';
import { PositionScrub } from './PositionScrub';
import classes from './ScenePanels.module.css';

/** The operator name of a property edit. Not a hand edit: each one is a version of its own. */
export const NOTES_PROPERTIES_OPERATION = 'edit-properties';

interface FieldProps {
  label: string;
  /** The stored value as text; the field starts over from it after every committed edit. */
  value: string;
  description: string;
  disabled: boolean;
  /** Returns the problem, or null when the edit landed. */
  onCommit(text: string): string | null;
  /** Overrides the accessible name where the visible label alone is ambiguous. */
  ariaLabel?: string;
}

/** A text field that commits on Enter or blur and keeps what was typed, with the reason, when refused. */
function PropertyField({ label, value, description, disabled, onCommit, ariaLabel }: FieldProps) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // The stored value moved (an edit landed, undo, another data-block state): show it.
    setSeen(value);
    setDraft(value);
    setError(null);
  }

  function commit() {
    if (draft.trim() === value) {
      setError(null);
      return;
    }
    const problem = onCommit(draft);
    setError(problem);
    if (problem === null) {
      // Landed, or was an equivalent way of writing the stored value: show the canonical text.
      setDraft(value);
    }
  }

  return (
    <TextInput
      label={label}
      aria-label={ariaLabel}
      description={description}
      value={draft}
      error={error}
      disabled={disabled}
      styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit();
        } else if (event.key === 'Escape') {
          setDraft(value);
          setError(null);
        }
      }}
    />
  );
}

/**
 * The data-block's own properties in the left inspector while it is open: total length, playback start,
 * loop and time signature. Each edit goes through the desk's edit path as its own version and one
 * undo step. The inputs never touch the editor's selection (it lives in the editor).
 */
export function NotesPropertiesPanel({ dataBlock }: { dataBlock: PacketBlock }) {
  const { commitDataBlockEditById, latestDataBlockById, loading, locked } = useDesk();
  const [notice, setNotice] = useState<string | null>(null);
  const applies = hasNotesProperties(dataBlock.payload.packet);
  const properties = readNotesProperties(dataBlock.payload.packet);
  const meter = properties.timeSignature;
  const disabled = loading || locked;

  /** Applies a change; the problem as text when it was refused. */
  function apply(change: Partial<NotesProperties>, coalesceKey?: string): string | null {
    // Built from the desk's packet as it is now, so a commit that landed since the last render
    // (the editor's, or another tab's) is not reverted.
    const latest = latestDataBlockById(dataBlock.id)?.payload.packet ?? dataBlock.payload.packet;
    const edit = editNotesProperties(latest, change);
    if (!edit.ok) {
      return edit.error;
    }
    if (edit.packet === latest) {
      return null;
    }
    const result = commitDataBlockEditById(
      dataBlock.id,
      edit.packet,
      NOTES_PROPERTIES_OPERATION,
      coalesceKey === undefined ? undefined : { coalesceKey }
    );
    return result.ok ? null : result.error;
  }

  /** The data-block's properties as the desk has them now, not as this render saw them. */
  function latestProperties() {
    return readNotesProperties(
      latestDataBlockById(dataBlock.id)?.payload.packet ?? dataBlock.payload.packet
    );
  }

  const timeField = (
    key: 'length' | 'start' | 'loopStart' | 'loopLength',
    label: string,
    ariaLabel: string,
    kind: 'position' | 'length',
    value: Rational,
    info: string,
    onCommit: (value: Rational) => string | null
  ) => (
    <div className={classes.field}>
      <span className={classes.fieldLabel}>{label}</span>
      <div className={classes.controls}>
        <PositionScrub
          key={`${key}:${meter}`}
          aria-label={ariaLabel}
          className={classes.grow}
          kind={kind}
          meter={meter}
          value={value}
          disabled={disabled}
          info={info}
          onError={setNotice}
          onCommit={(next) => {
            const problem = onCommit(next);
            setNotice(problem);
            return problem;
          }}
        />
      </div>
    </div>
  );

  if (!applies) {
    return null;
  }

  return (
    <Stack gap="xs" aria-label="Notes properties" role="group">
      {timeField(
        'length',
        'Length',
        'Length',
        'length',
        properties.length,
        'Total length as bars.beats.ticks.%. Drag a part, or type 2, 0.1.2 or 1/4b.',
        (length) => apply({ length }, `${dataBlock.id}:length`)
      )}
      {timeField(
        'start',
        'Playback start',
        'Playback start',
        'position',
        properties.start,
        'Playback start as bar.beat.tick.%. Drag a part, or type 2, 1.3.5 or 1/4n.',
        (start) => apply({ start }, `${dataBlock.id}:start`)
      )}
      <Stack gap="xs" role="group" aria-label="Loop">
        <Button
          // On is the accent fill (a switch-class control); off is the plain outlined button.
          variant={properties.loopOn ? 'filled' : 'default'}
          aria-pressed={properties.loopOn}
          disabled={disabled}
          // The latest packet, like the fields: a render that has not caught up cannot flip it back.
          onClick={() => setNotice(apply({ loopOn: !latestProperties().loopOn }))}
        >
          Looping
        </Button>
        {timeField(
          'loopStart',
          'Start',
          'Loop start',
          'position',
          properties.loopStart,
          'Loop start as bar.beat.tick.%. The loop end moves with it.',
          (loopStart) => {
            // Moving the loop's start keeps its length (the end moves with it), from the latest
            // packet; where that would pass the data-block's end the length is shortened to fit. A start at
            // or after the end of the data-block leaves no loop at all and is refused.
            const latest = latestProperties();
            if (compareRational(loopStart, latest.length) >= 0) {
              return 'The loop start must be before the end of the data-block.';
            }
            const end = addRational(loopStart, subtractRational(latest.loopEnd, latest.loopStart));
            return apply(
              { loopStart, loopEnd: compareRational(end, latest.length) > 0 ? latest.length : end },
              `${dataBlock.id}:loopStart`
            );
          }
        )}
        {timeField(
          'loopLength',
          'Length',
          'Loop length',
          'length',
          subtractRational(properties.loopEnd, properties.loopStart),
          'Loop length as bars.beats.ticks.%.',
          // The loop's length is a duration; the end stored is the start plus it.
          (length) =>
            apply(
              { loopEnd: addRational(latestProperties().loopStart, length) },
              `${dataBlock.id}:loopLength`
            )
        )}
      </Stack>
      <PropertyField
        label="Time signature"
        description="for example 4/4 or 7/8"
        disabled={disabled}
        value={meter}
        onCommit={(text) => {
          const next = text.trim();
          return isValidMeter(next)
            ? apply({ timeSignature: next })
            : 'The time signature must be like 4/4: 1 to 32 beats over 1, 2, 4, 8, 16 or 32.';
        }}
      />
      {notice && (
        <Text c="var(--mantine-color-error)" role="alert">
          {notice}
        </Text>
      )}
    </Stack>
  );
}
