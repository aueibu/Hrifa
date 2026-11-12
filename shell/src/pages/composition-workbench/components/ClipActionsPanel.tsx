import { useEffect, useState, type MouseEvent } from 'react';
import { Button, Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { clipActionOperation, type ClipActionParams } from '../clipActions';
import { freezeClipProperties } from '../clipProperties';
import { clipActionById } from '../clipTypes';
import { useDesk } from '../desk';
import { newNoteItemId } from '../noteClipEdits';
import { readNoteEditor, useNoteEditorState } from '../noteEditorChannel';
import type { Snippet } from '../snippet';

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

  function run(id: string, params: ClipActionParams = {}) {
    try {
      runAction(id, params);
    } catch {
      setNotice({
        text: 'That action could not be completed, so nothing was changed.',
        refused: true,
      });
    }
  }

  function runAction(id: string, params: ClipActionParams) {
    // The desk's packet as it is now, and the editor's selection as it is now.
    const live = latestSnippetById(snippet.id)?.packet ?? snippet.packet;
    const action = clipActionById(live, id);
    if (!action || !action.applies(live)) {
      setNotice({ text: 'This clip does not support that action.', refused: true });
      return;
    }
    const channel = readNoteEditor(snippet.id);
    // An old clip freezes its properties with its first edit, in the same version (as every edit).
    const base = freezeClipProperties(live);
    const result = action.run(
      base,
      {
        selection: channel?.selection ?? { ids: [], range: null },
        gridUnit: channel?.snapUnit,
        newId: () => newNoteItemId(snippet.id),
      },
      params
    );
    if (!result.ok) {
      setNotice({ text: result.error, refused: true });
      return;
    }
    if (result.packet === base) {
      setNotice({ text: 'Nothing to change.', refused: false });
      return;
    }
    const committed = commitSnippetEditById(
      snippet.id,
      result.packet,
      clipActionOperation(action.id)
    );
    if (!committed.ok) {
      setNotice({ text: committed.error, refused: true });
      return;
    }
    setNotice(null);
    channel?.adopt(result, committed.snippet.packet);
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
          {button('rotate-values', 'Values', 'Rotate values', () =>
            run('rotate-values', { amount: rotation })
          )}
          {button('rotate-time', 'Time', 'Rotate in time', () =>
            run('rotate-time', { amount: rotation })
          )}
        </Group>
      </Stack>
      <Group gap={4} wrap="wrap">
        {button('legato', 'Legato', 'Legato', () => run('legato'))}
        {button('quantize', 'Quantize', 'Quantize', () => run('quantize'))}
        {button('duplicate', 'Duplicate', 'Duplicate selection', () => run('duplicate'))}
      </Group>
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
