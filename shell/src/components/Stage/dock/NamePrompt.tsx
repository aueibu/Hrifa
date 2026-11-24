/**
 * A small name prompt (a Mantine modal with one text input): Enter confirms, Escape or Cancel cancels, an empty or taken
 * name is refused with a message and the prompt stays open. Used for "New docker..." (the docker menu and the tab menu)
 * and for renaming a workspace. The caller owns what happens next (including where focus goes: the modal does not
 * return it, `returnFocus` is off, so the caller can put it where its action leads).
 */
import { useState } from 'react';
import { Button, Group, Modal, TextInput } from '@mantine/core';
import { validateName } from './dockerName';

export interface NamePromptProps {
  opened: boolean;
  title: string;
  label: string;
  /** The name the input starts with (selected). */
  initial: string;
  /** Names that are taken (case-insensitive). */
  taken: readonly string[];
  /** "docker" or "workspace", for the refusal message. */
  noun?: string;
  confirmLabel?: string;
  onConfirm(name: string): void;
  onCancel(): void;
}

export function NamePrompt(props: NamePromptProps) {
  return (
    <Modal
      opened={props.opened}
      onClose={props.onCancel}
      title={props.title}
      size="sm"
      centered
      returnFocus={false}
      transitionProps={{ duration: 0 }}
    >
      <PromptForm {...props} />
    </Modal>
  );
}

function PromptForm({
  label,
  initial,
  taken,
  noun = 'docker',
  confirmLabel = 'Create',
  onConfirm,
  onCancel,
}: NamePromptProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const problem = validateName(value, taken, noun);
        if (problem) {
          setError(problem);
          return;
        }
        onConfirm(value.trim());
      }}
    >
      <TextInput
        label={label}
        value={value}
        error={error}
        data-autofocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setValue(e.currentTarget.value);
          setError(null);
        }}
      />
      <Group justify="flex-end" mt="md" gap="xs">
        <Button type="button" variant="default" size="xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="xs">
          {confirmLabel}
        </Button>
      </Group>
    </form>
  );
}
