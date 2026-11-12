import { useState } from 'react';
import { Button, Stack, Text, TextInput } from '@mantine/core';
import {
  editClipProperties,
  hasClipProperties,
  readClipProperties,
  type ClipProperties,
} from '../clipProperties';
import {
  formatLength,
  formatPosition,
  parseLength,
  parsePosition,
  type ParseResult,
} from '../clipTime';
import { useDesk } from '../desk';
import { addRational, compareRational, subtractRational } from '../musicalTime';
import type { Snippet } from '../snippet';
import { isValidMeter } from '../transport';

/** The operation name of a property edit. Not a hand edit: each one is a version of its own. */
export const CLIP_PROPERTIES_OPERATION = 'edit-clip-properties';

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
    // The stored value moved (an edit landed, undo, another clip state): show it.
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
      size="xs"
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
 * The clip's own properties in the left inspector while it is open: total length, playback start,
 * loop and time signature. Each edit goes through the desk's edit path as its own version and one
 * undo step. The inputs never touch the editor's selection (it lives in the editor).
 */
export function ClipPropertiesPanel({ snippet }: { snippet: Snippet }) {
  const { commitSnippetEditById, latestSnippetById, loading, locked } = useDesk();
  const [notice, setNotice] = useState<string | null>(null);
  const applies = hasClipProperties(snippet.packet);
  const properties = readClipProperties(snippet.packet);
  const meter = properties.timeSignature;
  const disabled = loading || locked;

  /** Applies a change; the problem as text when it was refused. */
  function apply(change: Partial<ClipProperties>): string | null {
    // Built from the desk's packet as it is now, so a commit that landed since the last render
    // (the editor's, or another tab's) is not reverted.
    const latest = latestSnippetById(snippet.id)?.packet ?? snippet.packet;
    const edit = editClipProperties(latest, change);
    if (!edit.ok) {
      return edit.error;
    }
    if (edit.packet === latest) {
      return null;
    }
    const result = commitSnippetEditById(snippet.id, edit.packet, CLIP_PROPERTIES_OPERATION);
    return result.ok ? null : result.error;
  }

  /** The clip's properties as the desk has them now, not as this render saw them. */
  function latestProperties() {
    return readClipProperties(latestSnippetById(snippet.id)?.packet ?? snippet.packet);
  }

  const positionField = (key: 'start' | 'loopStart', label: string, description: string) => (
    <PropertyField
      key={`${key}:${meter}`}
      label={label}
      ariaLabel={key === 'loopStart' ? 'Loop start' : undefined}
      description={description}
      disabled={disabled}
      value={formatPosition(properties[key], meter)}
      onCommit={(text) => {
        const parsed: ParseResult = parsePosition(text, meter);
        if (!parsed.ok) {
          return parsed.error;
        }
        if (key === 'loopStart') {
          // Moving the loop's start keeps its length (the end moves with it), from the latest
          // packet; where that would pass the clip's end the length is shortened to fit. A start at
          // or after the end of the clip leaves no loop at all and is refused.
          const latest = latestProperties();
          if (compareRational(parsed.value, latest.length) >= 0) {
            return 'The loop start must be before the end of the clip.';
          }
          const end = addRational(parsed.value, subtractRational(latest.loopEnd, latest.loopStart));
          return apply({
            loopStart: parsed.value,
            loopEnd: compareRational(end, latest.length) > 0 ? latest.length : end,
          });
        }
        return apply({ [key]: parsed.value });
      }}
    />
  );

  if (!applies) {
    return null;
  }

  return (
    <Stack gap="xs" aria-label="Clip properties" role="group">
      <PropertyField
        key={`length:${meter}`}
        label="Length"
        description="bars.beats.ticks"
        disabled={disabled}
        value={formatLength(properties.length, meter)}
        onCommit={(text) => {
          const parsed = parseLength(text, meter);
          return parsed.ok ? apply({ length: parsed.value }) : parsed.error;
        }}
      />
      {positionField('start', 'Playback start', 'bar.beat.tick')}
      <Stack gap="xs" role="group" aria-label="Loop">
        <Button
          size="xs"
          // On is the accent fill (a switch-class control); off is the plain outlined button.
          variant={properties.loopOn ? 'filled' : 'default'}
          aria-pressed={properties.loopOn}
          disabled={disabled}
          // The latest packet, like the fields: a render that has not caught up cannot flip it back.
          onClick={() => setNotice(apply({ loopOn: !latestProperties().loopOn }))}
        >
          Looping
        </Button>
        {positionField('loopStart', 'Start', 'bar.beat.tick')}
        <PropertyField
          key={`loopLength:${meter}`}
          label="Length"
          ariaLabel="Loop length"
          description="bars.beats.ticks"
          disabled={disabled}
          value={formatLength(subtractRational(properties.loopEnd, properties.loopStart), meter)}
          onCommit={(text) => {
            const parsed = parseLength(text, meter);
            // The loop's length is a duration; the end stored is the start plus it.
            return parsed.ok
              ? apply({ loopEnd: addRational(latestProperties().loopStart, parsed.value) })
              : parsed.error;
          }}
        />
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
        <Text size="xs" c="var(--mantine-color-error)" role="alert">
          {notice}
        </Text>
      )}
    </Stack>
  );
}
