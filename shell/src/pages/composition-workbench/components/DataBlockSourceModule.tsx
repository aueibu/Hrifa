import { Alert, Badge, Text } from '@mantine/core';
import { useDesk } from '../desk';
import { useModuleEvaluationResult } from '../runtime/evaluationStore';
import { DataBlockPreview } from './DataBlockPreview';
import { ModuleDevice } from './ModuleDevice';
import { ModuleInspectorContent, ModuleOutputsSection } from './ModuleHost';
import classes from './DeskView.module.css';

export interface DataBlockSourceModuleProps {
  instanceId: string;
  instanceLabel: string;
  dataBlockId: string | undefined;
}

/**
 * A desk data-block placed on the canvas as a source. It publishes the data-block's packet on one output,
 * unchanged, so any module that accepts that kind of packet can read it. The desk owns the data-block;
 * if it is deleted this module publishes nothing and its receivers show a missing source.
 */
export function DataBlockSourceModule({
  instanceId,
  instanceLabel,
  dataBlockId,
}: DataBlockSourceModuleProps) {
  const { dataBlocks } = useDesk();
  const dataBlock = dataBlocks.find((candidate) => candidate.id === dataBlockId);

  const { outputs: publishedOutputs } = useModuleEvaluationResult('data-block-source', instanceId);

  return (
    <ModuleDevice
      name={instanceLabel}
      status={dataBlock ? dataBlock.name : 'Missing data-block'}
      badges={
        dataBlock && (
          <>
            <Badge variant="outline">
              {dataBlock.packet.kind} | {dataBlock.packet.domain}
            </Badge>
            <Badge variant="outline">{dataBlock.packet.items.length} items</Badge>
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
      {dataBlock ? (
        <div className={classes.screen}>
          <DataBlockPreview packet={dataBlock.packet} />
        </div>
      ) : (
        <Alert color="yellow" title="This data-block is no longer on the desk">
          Receivers show a missing source. Remove this module, or restore the data-block.
        </Alert>
      )}
    </ModuleDevice>
  );
}
