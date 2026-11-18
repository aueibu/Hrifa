import { useMemo } from 'react';
import { Accordion, Alert, Badge, Select, Stack, Text, TextInput } from '@mantine/core';
import { useCompositionSettings } from '../compositionSettings';
import { pitchClassName } from '../pitch';
import { useModuleEvaluationResult } from '../runtime/evaluationStore';
import { useModuleState } from '../runtime/moduleState';
import {
  acceptsPermutationMode,
  scaleConstructionState,
} from '../runtime/moduleState/scaleConstruction';
import { cycleLabel, cycleFolders, type MelodicFamily } from '../scaleConstruction';
import {
  acceptsString,
  compositionInstanceStateKey,
  compositionStateKeys,
  usePersistentState,
} from '../usePersistentState';
import { ModuleDevice } from './ModuleDevice';
import { InspectorSection, ModuleInspectorContent, ModuleOutputsSection } from './ModuleHost';
import classes from '../CompositionWorkbench.module.css';

const permutationModeOptions = [
  { value: 'general', label: 'General (n!)' },
  { value: 'circular', label: 'Circular (n)' },
];

function parseIntervalText(value: string) {
  return value
    .split(/[\s,+]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n));
}

interface FolderNode {
  label: string;
  folders: FolderNode[];
  families: MelodicFamily[];
}

/** Files each family under its "Cycles a–b" folders (see cycleFolders). */
function buildFolderTree(families: MelodicFamily[]): FolderNode {
  const root: FolderNode = { label: '', folders: [], families: [] };
  for (const family of families) {
    let node = root;
    for (const label of cycleFolders(family.cycle, families.length)) {
      let child = node.folders.find((candidate) => candidate.label === label);
      if (!child) {
        child = { label, folders: [], families: [] };
        node.folders.push(child);
      }
      node = child;
    }
    node.families.push(family);
  }
  return root;
}

/** Nested folder accordions down to the families; only the first folder at each level starts open. */
function FolderAccordion({ node, first }: { node: FolderNode; first: boolean }) {
  if (!node.folders.length) {
    return <FamilyAccordion families={node.families} defaultOpen={first} />;
  }
  return (
    <Accordion multiple variant="separated" defaultValue={first ? ['0'] : []}>
      {node.folders.map((folder, index) => (
        <Accordion.Item key={folder.label} value={String(index)}>
          <Accordion.Control>
            <Text size="sm" fw={600}>
              {folder.label}
            </Text>
          </Accordion.Control>
          <Accordion.Panel>
            <FolderAccordion node={folder} first={first && index === 0} />
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

/** One collapsible header per family; the original's family starts open when `defaultOpen`. */
function FamilyAccordion({
  families,
  defaultOpen,
}: {
  families: MelodicFamily[];
  defaultOpen: boolean;
}) {
  return (
    <Accordion
      multiple
      variant="separated"
      defaultValue={defaultOpen && families[0]?.cycle === 0 ? ['0'] : []}
    >
      {families.map((family) => (
        <Accordion.Item key={family.cycle} value={String(family.cycle)}>
          <Accordion.Control>
            <Text size="sm" fw={600}>
              {cycleLabel(family.cycle)}
              <Text span size="xs" c="dimmed" ml="xs">
                {family.forms.length} rotations · {family.inversions} swap
                {family.inversions === 1 ? '' : 's'} from original
              </Text>
            </Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={2}>
              {family.forms.map((form) => (
                <Text key={form.shift} ff="monospace" size="xs">
                  {form.values.join(' + ')}
                </Text>
              ))}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

interface ScaleConstructionModuleProps {
  instanceId: string;
  instanceLabel: string;
}

export function ScaleConstructionModule({
  instanceId,
  instanceLabel,
}: ScaleConstructionModuleProps) {
  const { settings } = useCompositionSettings();
  const edo = settings.edo;
  const stateKey = (key: string) =>
    compositionInstanceStateKey(key, instanceId, 'scale-construction');
  const [
    { intervals, root, permutationMode },
    { intervals: setIntervals, root: setRoot, permutationMode: setPermutationMode },
  ] = useModuleState(scaleConstructionState, instanceId);
  const [intervalText, setIntervalText] = usePersistentState(
    stateKey(`${compositionStateKeys.scaleConstructionIntervals}.text`),
    intervals.join(', '),
    acceptsString
  );

  const {
    generated,
    families,
    offsets,
    melodicFormsOutput,
    outputs: publishedOutputs,
  } = useModuleEvaluationResult('scale-construction', instanceId);
  const folderTree = useMemo(() => buildFolderTree(families), [families]);

  function commitIntervalText(text: string) {
    setIntervalText(text);
    const parsed = parseIntervalText(text);
    if (parsed.length) {
      setIntervals(parsed);
    }
  }

  function resetScaleConstruction() {
    setIntervals([2, 2, 1]);
    setIntervalText('2, 2, 1');
    setRoot(0);
    setPermutationMode('general');
  }

  const rootValue = ((Number(root) % edo) + edo) % edo;
  const formCount = melodicFormsOutput?.items.length ?? 0;

  const view = generated.error ? (
    <Alert color="red" title="No scale">
      {generated.error}
    </Alert>
  ) : (
    generated.result && (
      <>
        <div>
          <Text fw={600} size="xs" mb={4}>
            Scale (from root {pitchClassName(rootValue, edo)})
          </Text>
          <Text ff="monospace" size="sm" className={classes.pitchValues}>
            {offsets.map((offset) => pitchClassName(((offset % edo) + edo) % edo, edo)).join(' - ')}
          </Text>
          <Text ff="monospace" size="sm" mt={4} className={classes.durationText}>
            {intervals.join(' + ')}
          </Text>
        </div>
        <Text size="xs" c="dimmed">
          {formCount} melodic form{formCount === 1 ? '' : 's'} in {families.length}{' '}
          {families.length === 1 ? 'family' : 'families'} ({permutationMode} permutation of the
          interval sequence's own positions — coincident-valued forms are reported as separate
          entries, not collapsed).
        </Text>
        <FolderAccordion node={folderTree} first />
      </>
    )
  );

  return (
    <ModuleDevice
      name={instanceLabel}
      status={
        generated.result
          ? 'Pitch-scale construction from an interval sequence'
          : 'Needs one or more positive intervals'
      }
      badges={
        generated.result && (
          <>
            <Badge variant="outline">period {generated.result.period}</Badge>
            <Badge variant="outline">{intervals.length + 1} units</Badge>
          </>
        )
      }
      onReset={resetScaleConstruction}
      footer={
        <Text size="xs" c="dimmed" truncate>
          Book II Ch. 1-2: scale built from the gaps between pitch-units.
        </Text>
      }
      controls={
        <>
          <InspectorSection label="Interval sequence">
            <TextInput
              aria-label="Interval sequence"
              description="Semitone gaps between pitch-units, e.g. 2, 2, 1"
              value={intervalText}
              onChange={(event) => setIntervalText(event.currentTarget.value)}
              onBlur={(event) => commitIntervalText(event.currentTarget.value)}
            />
            <Select
              label="Root"
              aria-label="Root pitch class"
              data={Array.from({ length: edo }, (_, value) => ({
                value: String(value),
                label: pitchClassName(value, edo),
              }))}
              value={String(rootValue)}
              onChange={(value) => value !== null && setRoot(Number(value))}
            />
            <Select
              label="Melodic forms"
              aria-label="Permutation mode"
              data={permutationModeOptions}
              value={permutationMode}
              allowDeselect={false}
              onChange={(value) =>
                value && acceptsPermutationMode(value) && setPermutationMode(value)
              }
            />
          </InspectorSection>

          <ModuleInspectorContent>
            <ModuleOutputsSection instanceLabel={instanceLabel} outputs={publishedOutputs} />
          </ModuleInspectorContent>
        </>
      }
    >
      {view}
    </ModuleDevice>
  );
}
