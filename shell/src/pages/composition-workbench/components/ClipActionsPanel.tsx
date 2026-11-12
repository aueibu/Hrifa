import { useEffect, useState, type MouseEvent } from 'react';
import { Button, Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { runClipAction } from '../clipActionRunner';
import type { ClipActionParams } from '../clipActions';
import { clipActionById } from '../clipTypes';
import { useDesk } from '../desk';
import { useNoteClipboard } from '../noteClipboard';
import { readNoteEditor, useNoteEditorState } from '../noteEditorChannel';
import type { Snippet } from '../snippet';

/** The rotation amount field stepped by one (a field that is not a whole number steps from 0). */
function stepRotation(text: string, delta: number): number {
  const current = Number(text.trim());
  return (Number.isSafeInteger(current) ? current : 0) + delta;
}

/**
 * The clip's actions (transforms) in the left inspector while it is open. The buttons call the
 * clip type's registry actions (`clipActionById`), the same functions a right-click menu will call.
 * Each action works on what the editor has selected right now (read from the editor channel when a
 * button is pressed; never a render's copy), otherwise on the whole clip, and lands as its own
 * version (`transform-<id>`, not a hand edit) and one undo step. A refusal is shown here and
 * changes nothing. Pressing a button never moves focus or touches the editor's selection: the
 * selection lives in the editor, the panel only reads it.
 */
export function ClipActionsPanel({ snippet }: { snippet: Snippet }) {
  const { commitSnippetEditById, latestSnippetById, loading, locked } = useDesk();
  const editor = useNoteEditorState(snippet.id);
  const [notice, setNotice] = useState<{ text: string; refused: boolean } | null>(null);
  const [mode, setMode] = useState<'whole' | 'individual'>('whole');
  const [factor, setFactor] = useState('2');
  const [rotation, setRotation] = useState('1');
  const [semitones, setSemitones] = useState('1');
  const [equalLength, setEqualLength] = useState('');
  const [equalVelocity, setEqualVelocity] = useState('');
  const clipboard = useNoteClipboard();
  const disabled = loading || locked;

  // A notice is about the selection it was made with: drop it when the editor's selection changes.
  const selectionKey = editor
    ? JSON.stringify([editor.selection.ids, editor.selection.range, editor.selection.kind])
    : '';
  useEffect(() => {
    setNotice(null);
  }, [selectionKey]);

  /** Whether this clip's type implements the action and it applies to the packet. */
  function available(id: string) {
    const action = clipActionById(snippet.packet, id);
    return action !== undefined && action.applies(snippet.packet);
  }

  /** Runs an action through the shared runner and shows what happened. Never throws. */
  function run(id: string, params: ClipActionParams = {}) {
    // Any other action ends a pitch pick that is waiting (the selection stays as it is).
    readNoteEditor(snippet.id)?.cancelPick?.();
    const outcome = runClipAction({
      snippetId: snippet.id,
      fallback: snippet.packet,
      actionId: id,
      params,
      desk: { commitSnippetEditById, latestSnippetById },
    });
    switch (outcome.status) {
      case 'committed':
        setNotice(outcome.message ? { text: outcome.message, refused: false } : null);
        break;
      case 'unchanged':
        setNotice({ text: outcome.message, refused: false });
        break;
      default:
        setNotice({ text: outcome.message, refused: true });
    }
  }

  /**
   * The two-part gestures: pressing the button puts the editor into pick-pitch mode, and the editor
   * calls back with the picked row (or Enter for the default). Without an open editor there is
   * nothing to pick in: Invert applies its default axis, the others say so.
   */
  function pick(
    id: string,
    hint: string,
    apply: (midi: number) => ClipActionParams,
    withDefault: boolean
  ) {
    const channel = readNoteEditor(snippet.id);
    if (!channel?.beginPick) {
      if (withDefault) {
        run(id);
      } else {
        setNotice({ text: 'Open the clip in the editor to pick a pitch.', refused: true });
      }
      return;
    }
    setNotice(null);
    channel.beginPick({
      actionId: id,
      hint,
      onPick: (midi) => run(id, apply(midi)),
      onDefault: withDefault ? () => run(id) : undefined,
    });
  }

  // Keep focus where it is (and so the editor's selection and keyboard scope) when a button or the
  // mode toggle is pressed; the text fields take focus as usual.
  function keepFocus(event: MouseEvent) {
    if (!(event.target as HTMLElement).closest('input')) {
      event.preventDefault();
    }
  }

  const button = (id: string, label: string, aria: string, onClick: () => void) => (
    <Button
      size="compact-xs"
      variant="default"
      aria-label={aria}
      disabled={disabled || !available(id)}
      onClick={onClick}
    >
      {label}
    </Button>
  );

  const selection = editor?.selection;
  const scope =
    selection?.kind === 'time'
      ? 'the selected time'
      : selection && selection.ids.length > 0
        ? `${selection.ids.length} selected note${selection.ids.length === 1 ? '' : 's'}`
        : 'the whole clip';

  return (
    <Stack gap="xs" role="group" aria-label="Clip actions" onMouseDown={keepFocus}>
      <Text size="xs" fw={600}>
        Actions
      </Text>
      <Text size="xs" c="dimmed" aria-live="polite">
        Acts on {scope}.
      </Text>
      <Stack gap={4} role="group" aria-label="Scale">
        <Group gap={4} wrap="wrap">
          <Text size="xs">Scale</Text>
          {button('scale', '×2', 'Scale by 2', () => run('scale', { factor: 2, mode }))}
          {button('scale', '÷2', 'Scale by one half', () => run('scale', { factor: 0.5, mode }))}
        </Group>
        <SegmentedControl
          size="xs"
          aria-label="Scale mode"
          disabled={disabled}
          value={mode}
          onChange={(value) => setMode(value === 'individual' ? 'individual' : 'whole')}
          data={[
            { value: 'whole', label: 'Whole' },
            { value: 'individual', label: 'Individually' },
          ]}
        />
        <Group gap={4} wrap="nowrap">
          <TextInput
            size="xs"
            aria-label="Scale factor"
            placeholder="2, 0.5 or 3/2"
            value={factor}
            disabled={disabled}
            onChange={(event) => setFactor(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                run('scale', { factor, mode });
              }
            }}
          />
          {button('scale', 'Apply', 'Apply scale', () => run('scale', { factor, mode }))}
        </Group>
      </Stack>
      <Group gap={4} wrap="wrap" role="group" aria-label="Reverse">
        <Text size="xs">Reverse</Text>
        {button('reverse-time', 'In time', 'Reverse in time', () => run('reverse-time'))}
        {button('reverse-order', 'Order', 'Reverse order', () => run('reverse-order'))}
      </Group>
      <Stack gap={4} role="group" aria-label="Rotate">
        <Text size="xs">Rotate</Text>
        <Group gap={4} wrap="wrap">
          <TextInput
            size="xs"
            aria-label="Rotate amount"
            placeholder="1 or -1"
            value={rotation}
            disabled={disabled}
            onChange={(event) => setRotation(event.currentTarget.value)}
          />
          <Button
            size="compact-xs"
            variant="default"
            aria-label="Rotate one step back"
            disabled={disabled || !available('rotate-values')}
            onClick={() => setRotation(String(stepRotation(rotation, -1)))}
          >
            −1
          </Button>
          <Button
            size="compact-xs"
            variant="default"
            aria-label="Rotate one step forward"
            disabled={disabled || !available('rotate-values')}
            onClick={() => setRotation(String(stepRotation(rotation, 1)))}
          >
            +1
          </Button>
        </Group>
        <Group gap={4} wrap="wrap">
          {button('rotate-values', 'Values', 'Rotate values', () =>
            run('rotate-values', { amount: rotation })
          )}
          {button('rotate-durations', 'Durations', 'Rotate durations', () =>
            run('rotate-durations', { amount: rotation })
          )}
          {button('rotate-time', 'Time', 'Rotate in time', () =>
            run('rotate-time', { amount: rotation })
          )}
        </Group>
      </Stack>
      <Group gap={4} wrap="wrap" role="group" aria-label="Clipboard">
        <Text size="xs">Clipboard</Text>
        {button('copy', 'Copy', 'Copy notes', () => run('copy'))}
        <Button
          size="compact-xs"
          variant="default"
          aria-label="Paste notes"
          disabled={disabled || !available('paste') || clipboard === null}
          onClick={() => run('paste')}
        >
          Paste
        </Button>
      </Group>
      <Group gap={4} wrap="wrap">
        {button('legato', 'Legato', 'Legato', () => run('legato'))}
        {button('quantize', 'Quantize', 'Quantize', () => run('quantize'))}
        {button('duplicate', 'Duplicate', 'Duplicate selection', () => run('duplicate'))}
      </Group>
      <Stack gap={4} role="group" aria-label="Invert">
        <Group gap={4} wrap="wrap">
          <Text size="xs">Invert</Text>
          {button('invert', 'Invert', 'Invert', () =>
            pick(
              'invert',
              'Click a pitch to mirror the notes around it, or press Enter to mirror around the middle of the notes. Escape cancels.',
              (midi) => ({ axis: midi * 100 }),
              true
            )
          )}
        </Group>
      </Stack>
      <Stack gap={4} role="group" aria-label="Make equal">
        <Text size="xs">Make all equal</Text>
        <Group gap={4} wrap="nowrap">
          <TextInput
            size="xs"
            aria-label="Equal duration"
            placeholder="first note's: 1, 0.5 or 1/8"
            value={equalLength}
            disabled={disabled}
            onChange={(event) => setEqualLength(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                run('equal-duration', { duration: equalLength });
              }
            }}
          />
          {button('equal-duration', 'Duration', 'Make all durations equal', () =>
            run('equal-duration', { duration: equalLength })
          )}
        </Group>
        <Group gap={4} wrap="nowrap">
          <TextInput
            size="xs"
            aria-label="Equal velocity"
            placeholder="first note's: 1 to 100 %"
            value={equalVelocity}
            disabled={disabled}
            onChange={(event) => setEqualVelocity(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                run('equal-velocity', { velocity: equalVelocity });
              }
            }}
          />
          {button('equal-velocity', 'Velocity', 'Make all velocities equal', () =>
            run('equal-velocity', { velocity: equalVelocity })
          )}
        </Group>
        <Group gap={4} wrap="wrap">
          {button('equal-pitch', 'Pitch', 'Make all pitches equal', () =>
            pick(
              'equal-pitch',
              'Click a pitch to give every note that pitch (a chord becomes that single pitch). Escape cancels.',
              (midi) => ({ pitch: midi * 100 }),
              false
            )
          )}
        </Group>
      </Stack>
      <Stack gap={4} role="group" aria-label="Transpose">
        <Text size="xs">Transpose</Text>
        <Group gap={4} wrap="wrap">
          <TextInput
            size="xs"
            aria-label="Transpose semitones"
            placeholder="semitones"
            value={semitones}
            disabled={disabled}
            onChange={(event) => setSemitones(event.currentTarget.value)}
          />
          {button('transpose', 'Apply', 'Transpose by semitones', () =>
            run('transpose', { semitones })
          )}
        </Group>
        <Group gap={4} wrap="wrap">
          {button('transpose', 'Octave −', 'Octave down', () =>
            run('transpose', { semitones: -12 })
          )}
          {button('transpose', 'Octave +', 'Octave up', () => run('transpose', { semitones: 12 }))}
        </Group>
      </Stack>
      {editor?.picking && (
        <Group gap={4} wrap="nowrap" role="status">
          <Text size="xs">Pick a pitch in the roll.</Text>
          <Button
            size="compact-xs"
            variant="default"
            aria-label="Cancel pick"
            onClick={() => editor.cancelPick()}
          >
            Cancel
          </Button>
        </Group>
      )}
      {notice && (
        <Text
          size="xs"
          c={notice.refused ? 'var(--mantine-color-error)' : 'dimmed'}
          role={notice.refused ? 'alert' : 'status'}
        >
          {notice.text}
        </Text>
      )}
    </Stack>
  );
}
