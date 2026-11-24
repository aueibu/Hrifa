import { Alert, Badge, Text } from '@mantine/core';
import { useDesk } from '../desk';
import { useNodeEvaluationResult } from '../runtime/evaluationStore';
import { DataBlockPreview } from './DataBlockPreview';
import { NodeDevice } from './NodeDevice';
import { NodeInspectorContent, NodeOutputsSection } from './NodeHost';
import classes from './DeskView.module.css';

export interface DataBlockSourceNodeProps {
  instanceId: string;
  instanceLabel: string;
  dataBlockId: string | undefined;
}

/**
 * A desk data-block placed on the canvas as a source. It publishes the data-block's packet on one output,
 * unchanged, so any node that accepts that kind of packet can read it. The desk owns the data-block;
 * if it is deleted this node publishes nothing and its receivers show a missing source.
 */
export function DataBlockSourceNode({
  instanceId,
  instanceLabel,
  dataBlockId,
}: DataBlockSourceNodeProps) {
  const { dataBlocks } = useDesk();
  const dataBlock = dataBlocks.find((candidate) => candidate.id === dataBlockId);

  const { outputs: publishedOutputs } = useNodeEvaluationResult('data-block-source', instanceId);

  return (
    <NodeDevice
      name={instanceLabel}
      status={dataBlock ? dataBlock.name : 'Missing data-block'}
      badges={
        dataBlock && (
          <>
            <Badge variant="outline">
              {dataBlock.payload.packet.kind} | {dataBlock.payload.packet.domain}
            </Badge>
            <Badge variant="outline">{dataBlock.payload.packet.items.length} items</Badge>
          </>
        )
      }
      footer={
        <Text size="xs" c="dimmed" truncate>
          A copy kept on the desk. Edit or delete it there.
        </Text>
      }
      controls={
        <NodeInspectorContent>
          <NodeOutputsSection instanceLabel={instanceLabel} outputs={publishedOutputs} />
        </NodeInspectorContent>
      }
    >
      {dataBlock ? (
        <div className={classes.screen}>
          <DataBlockPreview packet={dataBlock.payload.packet} />
        </div>
      ) : (
        <Alert color="yellow" title="This data-block is no longer on the desk">
          Receivers show a missing source. Remove this node, or restore the data-block.
        </Alert>
      )}
    </NodeDevice>
  );
}
