import { Alert, Badge, Text } from '@mantine/core';
import { useDesk } from '../desk';
import { useModuleEvaluationResult } from '../runtime/evaluationStore';
import { ModuleDevice } from './ModuleDevice';
import { ModuleInspectorContent, ModuleOutputsSection } from './ModuleHost';
import { SnippetPreview } from './SnippetPreview';
import classes from './DeskView.module.css';

export interface SnippetSourceModuleProps {
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
}: SnippetSourceModuleProps) {
  const { snippets } = useDesk();
  const snippet = snippets.find((candidate) => candidate.id === snippetId);

  const { outputs: publishedOutputs } = useModuleEvaluationResult('snippet', instanceId);

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
