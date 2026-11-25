import { useEffect, useRef, useState } from 'react';
import { Text } from '@mantine/core';
import { Button } from '../../../ui';
import type { PublishedCompositionOutput } from '../compositionRouting';
import { captureDataBlock } from '../dataBlock';
import { chooseTypeId } from '../dataBlocks/registry';
// Registers the built-in data-block types, so `chooseTypeId` knows them here.
import '../dataBlocks/types';
import { newDataBlockId, useDesk } from '../desk';

/**
 * Sends a node output to the desk as a whole-packet data-block. Any kind can be captured whole, so
 * this works for every output a node publishes; selecting part of one is done in the editor that
 * shows it (the piano roll for notes). The data-block is a copy: later changes to the node do not
 * reach it.
 */
export function SendToDeskButton({ output }: { output: PublishedCompositionOutput }) {
  const { addDataBlock } = useDesk();
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

  const unsupported =
    chooseTypeId(output.packet) === undefined
      ? `No data-block type holds this output yet (${output.packet.kind} of ${output.packet.domain}).`
      : undefined;

  function send() {
    const captured = captureDataBlock({
      id: newDataBlockId(),
      createdAt: new Date().toISOString(),
      name: output.label,
      packet: output.packet,
      nodeInstance: output.ref.instanceId,
      portId: output.ref.port,
    });
    if (!captured.ok) {
      say(captured.error);
      return;
    }
    addDataBlock(captured.dataBlock);
    say('Sent to the desk.');
  }

  return (
    <div>
      <Button
        variant="default"
        data-info="Copy this output to the desk, where it can be heard, renamed and placed back on the canvas as a source."
        disabled={unsupported !== undefined}
        title={unsupported}
        onClick={send}
      >
        Send to desk
      </Button>
      {message && (
        <Text c="dimmed" mt={4} aria-live="polite">
          {message}
        </Text>
      )}
    </div>
  );
}
