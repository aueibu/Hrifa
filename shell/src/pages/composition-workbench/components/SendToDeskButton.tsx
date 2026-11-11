import { useEffect, useRef, useState } from 'react';
import { Button, Text } from '@mantine/core';
import type { PublishedCompositionOutput } from '../compositionRouting';
import { newSnippetId, useDesk } from '../desk';
import { captureSnippet } from '../snippet';

/**
 * Sends a module output to the desk as a whole-packet snippet. Any kind can be captured whole, so
 * this works for every output a module publishes; selecting part of one is done in the editor that
 * shows it (the piano roll for notes). The snippet is a copy: later changes to the module do not
 * reach it.
 */
export function SendToDeskButton({ output }: { output: PublishedCompositionOutput }) {
  const { addSnippet } = useDesk();
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    },
    []
  );

  function say(text: string) {
    setMessage(text);
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setMessage(null), 2500);
  }

  function send() {
    const captured = captureSnippet({
      id: newSnippetId(),
      createdAt: new Date().toISOString(),
      name: output.label,
      packet: output.packet,
      moduleInstance: output.ref.instanceId,
      portId: output.ref.port,
    });
    if (!captured.ok) {
      say(captured.error);
      return;
    }
    addSnippet(captured.snippet);
    say('Sent to the desk.');
  }

  return (
    <div>
      <Button
        size="compact-xs"
        variant="default"
        data-info="Copy this output to the desk, where it can be heard, renamed and placed back on the canvas as a source."
        onClick={send}
      >
        Send to desk
      </Button>
      {message && (
        <Text size="xs" c="dimmed" mt={4} aria-live="polite">
          {message}
        </Text>
      )}
    </div>
  );
}
