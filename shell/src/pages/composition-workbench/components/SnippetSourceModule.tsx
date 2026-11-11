import { useEffect, useMemo } from 'react';
import { Alert, Badge, Text } from '@mantine/core';
import type {
  CompositionModuleRoutingProps,
  PublishedCompositionOutput,
} from '../compositionRouting';
import { useDesk } from '../desk';
import { ModuleDevice } from './ModuleDevice';
import { ModuleInspectorContent, ModuleOutputsSection } from './ModuleHost';
import { SnippetPreview } from './SnippetPreview';
import classes from './DeskView.module.css';

export interface SnippetSourceModuleProps extends CompositionModuleRoutingProps {
  instanceId: string;
  instanceLabel: string;
  snippetId: string | undefined;
}

/**
 * A desk snippet placed on the canvas as a source. It publishes the snippet's packet on one output,
 * unchanged, so any module that accepts that kind of packet can read it. The desk owns the snippet;
 * if it is deleted this module publishes nothing and its receivers show a missing source.
 */
export function SnippetSourceModule({
  instanceId,
  instanceLabel,
  snippetId,
  onOutputsChange,
}: SnippetSourceModuleProps) {
  const { snippets } = useDesk();
  const snippet = snippets.find((candidate) => candidate.id === snippetId);

  const publishedOutputs = useMemo<PublishedCompositionOutput[]>(
    () =>
      snippet
        ? [
            {
              ref: { instanceId, port: 'snippet' },
              label: `${instanceLabel} · ${snippet.name}`,
              packet: snippet.packet,
            },
          ]
        : [],
    [instanceId, instanceLabel, snippet]
  );

  useEffect(() => {
    onOutputsChange?.(instanceId, publishedOutputs);
  }, [instanceId, onOutputsChange, publishedOutputs]);

  return (
    <ModuleDevice
      name={instanceLabel}
      status={snippet ? snippet.name : 'Missing snippet'}
      badges={
        snippet && (
          <>
            <Badge variant="outline">
              {snippet.packet.kind} | {snippet.packet.domain}
            </Badge>
            <Badge variant="outline">{snippet.packet.items.length} items</Badge>
          </>
        )
      }
      footer={
        <Text size="xs" c="dimmed" truncate>
          A copy kept on the desk. Edit or delete it there.
        </Text>
      }
      controls={
        <ModuleInspectorContent>
          <ModuleOutputsSection instanceLabel={instanceLabel} outputs={publishedOutputs} />
        </ModuleInspectorContent>
      }
    >
      {snippet ? (
        <div className={classes.screen}>
          <SnippetPreview packet={snippet.packet} />
        </div>
      ) : (
        <Alert color="yellow" title="This snippet is no longer on the desk">
          Receivers show a missing source. Remove this module, or restore the snippet.
        </Alert>
      )}
    </ModuleDevice>
  );
}
