import { useState } from 'react';
import { Alert, Badge, Text } from '@mantine/core';
import { Button } from '../../../ui';
import { EnsureDataBlockOps, useDataBlockOps } from '../dataBlockOps';
import { makeSourceInputSpec } from '../dataBlocks/dataBlockMenuModel';
import { makeSourceRefusal } from '../dataBlocks/registry';
import { useDesk } from '../desk';
import { useNodeEvaluationResult } from '../runtime/evaluationStore';
import { DataBlockMenu } from './DataBlockMenu';
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
 * unchanged, so any node that accepts that kind of packet can read it. The desk owns the data-block.
 * Three truthful states: a data-block chosen, blank ("No data-block chosen": after Unlink or when
 * nothing was chosen) and missing ("no longer on the desk": it was deleted). The menu swaps the
 * data-block in place and never removes the node; Unlink clears the choice; a missing one can be
 * replaced everywhere (every user of the deleted data-block repointed, S1 repair).
 */
export function DataBlockSourceNode(props: DataBlockSourceNodeProps) {
  return (
    <EnsureDataBlockOps>
      <DataBlockSourceNodeBody {...props} />
    </EnsureDataBlockOps>
  );
}

function DataBlockSourceNodeBody({
  instanceId,
  instanceLabel,
  dataBlockId,
}: DataBlockSourceNodeProps) {
  const { dataBlocks } = useDesk();
  const ops = useDataBlockOps();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const chosen = dataBlockId !== undefined && dataBlockId !== '';
  const dataBlock = chosen
    ? dataBlocks.find((candidate) => candidate.id === dataBlockId)
    : undefined;
  const state = !chosen ? 'blank' : dataBlock ? 'present' : 'missing';
  const spec = makeSourceInputSpec();

  const { outputs: publishedOutputs } = useNodeEvaluationResult('data-block-source', instanceId);

  function report(result: { ok: true } | { ok: false; error: string }) {
    setError(result.ok ? null : result.error);
  }

  const replacePreview =
    state === 'missing' && confirm ? ops.remapPreview(dataBlockId as string, confirm.id) : null;

  return (
    <NodeDevice
      name={instanceLabel}
      status={
        state === 'present'
          ? dataBlock?.name
          : state === 'blank'
            ? 'No data-block chosen'
            : 'Missing data-block'
      }
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
      actions={
        <>
          <DataBlockMenu
            spec={spec}
            label="Data-block"
            ariaLabel="Choose data-block"
            info="Choose which desk data-block this node reads. The node stays where it is."
            selectedId={dataBlockId}
            refuse={makeSourceRefusal}
            onPick={(row) => {
              setConfirm(null);
              report(ops.setSourceBlock(instanceId, row.block.id));
            }}
            onNew={(created) => report(ops.setSourceBlock(instanceId, created.id))}
          />
          <Button
            variant="default"
            disabled={!chosen}
            data-info={
              chosen
                ? 'Stop reading this data-block. The node stays, blank; the data-block stays on the desk.'
                : 'No data-block is chosen.'
            }
            onClick={() => {
              setConfirm(null);
              report(ops.setSourceBlock(instanceId, null));
            }}
          >
            Unlink
          </Button>
          {state === 'missing' && (
            <DataBlockMenu
              spec={spec}
              label="Replace everywhere with"
              ariaLabel="Replace everywhere with"
              info="Point every place that used the deleted data-block at another one."
              refuse={makeSourceRefusal}
              onPick={(row) => setConfirm({ id: row.block.id, name: row.block.name })}
            />
          )}
        </>
      }
      footer={
        <Text c="dimmed" truncate>
          {error ??
            (state === 'present'
              ? 'Reads a data-block on the desk. Edit or delete it there.'
              : state === 'blank'
                ? 'Choose a data-block from the menu above.'
                : 'Choose another data-block, or replace it everywhere.')}
        </Text>
      }
      controls={
        <NodeInspectorContent>
          <NodeOutputsSection instanceLabel={instanceLabel} outputs={publishedOutputs} />
        </NodeInspectorContent>
      }
    >
      {state === 'present' && dataBlock ? (
        <div className={classes.screen}>
          <DataBlockPreview packet={dataBlock.payload.packet} />
        </div>
      ) : state === 'blank' ? (
        <Alert color="gray" title="No data-block chosen">
          Receivers show a missing source until you choose one.
        </Alert>
      ) : (
        <Alert color="yellow" title="This data-block is no longer on the desk">
          Receivers show a missing source. Choose another data-block, Unlink, or replace it
          everywhere.
          {confirm && replacePreview && (
            <div>
              <Text mt="xs">
                {replacePreview.refusal ??
                  `Replace it in ${replacePreview.count} ${replacePreview.count === 1 ? 'place' : 'places'} with ${confirm.name}?`}
              </Text>
              <Button
                mt="xs"
                disabled={replacePreview.refusal !== null}
                onClick={() => {
                  report(ops.remap(dataBlockId as string, confirm.id));
                  setConfirm(null);
                }}
              >
                Replace everywhere
              </Button>
            </div>
          )}
        </Alert>
      )}
    </NodeDevice>
  );
}
