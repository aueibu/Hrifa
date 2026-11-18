import { Alert, Badge, NumberInput, Select, Stack, Text } from '@mantine/core';
import {
  arithmeticOperatorDefaults,
  arithmeticOperatorLabels,
  formatNumericTree,
  rawNumericTree,
  type ArithmeticOperator,
} from '../arithmetic';
import {
  compositionOutputOptions,
  outputRefKey,
  parseOutputRef,
  type CompositionModuleRoutingProps,
  type CompositionOutputRef,
  type PublishedCompositionOutput,
} from '../compositionRouting';
import { useCompositionSettings } from '../compositionSettings';
import type { ModuleRouteState } from '../compositionWorkspace';
import type { PitchAllocation } from '../melodicization';
import type { DataPacket } from '../model';
import { defaultModuloTreatment, type ModuloTreatment } from '../moduloTreatment';
import { pickArithmeticInputs } from '../runtime/evaluators/arithmetic';
import { useModuleEvaluation } from '../runtime/useModuleEvaluation';
import {
  acceptsNumberOrString,
  compositionStateKeys,
  compositionInstanceStateKey,
  usePersistentState,
} from '../usePersistentState';
import { ModuleDevice } from './ModuleDevice';
import { InspectorSection, ModuleInspectorContent, ModuleOutputsSection } from './ModuleHost';
import { ModuloControl } from './ModuloControl';
import { SourceMenu } from './SourceMenu';
import classes from '../CompositionWorkbench.module.css';

// Plain-number domains, plus pitch/pitchClass — bracketed groups of numbers, which
// arithmetic.ts recurses into one level (matching OM's own kernel.lisp: om+'s list+list method
// is a CLOS-dispatched mapcar that naturally recurses through nested lists). `note` is excluded:
// its items are full event objects (onset/duration/velocity), not a number or group of numbers.
const numericDomains = new Set([
  'integer',
  'rational',
  'duration',
  'onset',
  'interval',
  'cycleLength',
  'pulseCount',
  'phaseOffset',
  'pitch',
  'pitchClass',
]);

function compatibleNumeric(packet: DataPacket) {
  return (packet.kind === 'list' || packet.kind === 'value') && numericDomains.has(packet.domain);
}

// The raw numbers an operand actually contributes — the same decomposition computeArithmetic
// itself uses (rawNumericTree), not a separately re-derived value that could drift from what's
// really being combined. Every domain's item value, pitch and pitchClass included, is already
// `number | number[]` by construction, so decomposition no longer depends on which domain
// produced it — an unconnected port's fallback (a bare typed-in number) passes through the
// same way.
function rawOperandLine(source: DataPacket | undefined, fallback: number) {
  if (!source) {
    return String(fallback);
  }
  return source.items.map((item) => formatNumericTree(rawNumericTree(item.value))).join(', ');
}

function acceptsOperator(value: unknown): value is ArithmeticOperator {
  return (
    value === 'add' ||
    value === 'subtract' ||
    value === 'multiply' ||
    value === 'divide' ||
    value === 'floorDivide' ||
    value === 'power' ||
    value === 'exp'
  );
}

function acceptsCombineStrategy(value: unknown): value is PitchAllocation {
  return value === 'cycle' || value === 'cycle-rhythm' || value === 'zip' || value === 'cartesian';
}

function acceptsModuloTreatmentLocal(value: unknown): value is ModuloTreatment {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as ModuloTreatment).enabled === 'boolean' &&
    Number.isFinite((value as ModuloTreatment).divisor)
  );
}

const operatorOptions = (Object.keys(arithmeticOperatorLabels) as ArithmeticOperator[]).map(
  (operator) => ({ value: operator, label: `${arithmeticOperatorLabels[operator]} (${operator})` })
);

const combineStrategyOptions: { value: PitchAllocation; label: string }[] = [
  { value: 'cycle', label: 'Cycle A across B' },
  { value: 'cycle-rhythm', label: 'Cycle B across A' },
  { value: 'zip', label: 'Zip and stop at the shorter input' },
  { value: 'cartesian', label: 'Every combination' },
];

export interface ArithmeticModuleProps extends CompositionModuleRoutingProps {
  instanceId: string;
  instanceLabel: string;
  outputs: PublishedCompositionOutput[];
  routeState: ModuleRouteState;
  onBind(port: string, source: CompositionOutputRef | null): void;
}

export function ArithmeticModule({
  instanceId,
  instanceLabel,
  outputs,
  routeState,
  onBind,
  onOutputsChange,
}: ArithmeticModuleProps) {
  const { settings } = useCompositionSettings();
  const edo = settings.edo;
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId, 'arithmetic');
  const [operator, setOperator] = usePersistentState<ArithmeticOperator>(
    stateKey(compositionStateKeys.arithmeticOperator),
    'add',
    acceptsOperator
  );
  const [fallbackA, setFallbackA] = usePersistentState<number | string>(
    stateKey(compositionStateKeys.arithmeticFallbackA),
    arithmeticOperatorDefaults.add.a,
    acceptsNumberOrString
  );
  const [fallbackB, setFallbackB] = usePersistentState<number | string>(
    stateKey(compositionStateKeys.arithmeticFallbackB),
    arithmeticOperatorDefaults.add.b,
    acceptsNumberOrString
  );
  const [combineStrategy, setCombineStrategy] = usePersistentState<PitchAllocation>(
    stateKey(compositionStateKeys.arithmeticCombineStrategy),
    'zip',
    acceptsCombineStrategy
  );
  const [modulo, setModulo] = usePersistentState<ModuloTreatment>(
    stateKey(compositionStateKeys.arithmeticModulo),
    defaultModuloTreatment,
    acceptsModuloTreatmentLocal
  );

  const isUnary = operator === 'exp';
  const bindingA = routeState.a;
  const bindingB = routeState.b;
  const {
    treatedA,
    treatedB,
    result,
    outputs: publishedOutputs,
  } = useModuleEvaluation(
    'arithmetic',
    { operator, fallbackA, fallbackB, combineStrategy, modulo },
    pickArithmeticInputs(outputs, routeState, instanceId),
    { instanceId, instanceLabel, edo },
    onOutputsChange
  );

  function changeOperator(value: string | null) {
    if (!value || !acceptsOperator(value)) {
      return;
    }
    setOperator(value);
    const defaults = arithmeticOperatorDefaults[value];
    setFallbackA(defaults.a);
    setFallbackB(defaults.b);
  }

  const aOptions = compositionOutputOptions(outputs, instanceId, compatibleNumeric);

  const showCombineStrategy =
    !isUnary &&
    Boolean(treatedA) &&
    Boolean(treatedB) &&
    treatedA!.items.length > 1 &&
    treatedB!.items.length > 1 &&
    treatedA!.items.length !== treatedB!.items.length;

  const resultLine = `${result.packet.items
    .slice(0, 64)
    .map((item) => formatNumericTree(rawNumericTree(item.value)))
    .join(
      ', '
    )}${result.packet.items.length > 64 ? `, … (${result.packet.items.length} items)` : ''}`;

  const view = (
    <>
      {result.messages.length > 0 && (
        <Alert color="yellow" title="Arithmetic report">
          {result.messages.join(' ')}
        </Alert>
      )}

      <Stack gap={2}>
        <Text size="xs" c="dimmed">
          A raw:{' '}
          <Text span ff="monospace">
            {rawOperandLine(treatedA, Number(fallbackA) || 0)}
          </Text>
        </Text>
        {!isUnary && (
          <Text size="xs" c="dimmed">
            B raw:{' '}
            <Text span ff="monospace">
              {rawOperandLine(treatedB, Number(fallbackB) || 0)}
            </Text>
          </Text>
        )}
        <Text size="xs" c="dimmed">
          Result raw:{' '}
          <Text span ff="monospace">
            {resultLine}
          </Text>
        </Text>
      </Stack>

      <Text ff="monospace" size="sm" className={classes.pitchValues}>
        {result.packet.items
          .slice(0, 64)
          .map((item) => item.label)
          .join(', ')}
        {result.packet.items.length > 64 ? `, … (${result.packet.items.length} items)` : ''}
      </Text>
    </>
  );

  return (
    <ModuleDevice
      name={instanceLabel}
      status={`${arithmeticOperatorLabels[operator]} applied to A${isUnary ? '' : ' and B'}`}
      badges={
        <>
          <Badge variant="outline">{result.packet.items.length} items</Badge>
          <Badge variant="outline">{result.packet.domain}</Badge>
        </>
      }
      controls={
        <>
          <InspectorSection label="Operation">
            <Select
              label="Operator"
              data={operatorOptions}
              value={operator}
              allowDeselect={false}
              onChange={changeOperator}
            />
            {showCombineStrategy && (
              <Select
                label="Combine strategy"
                description="A and B are different lengths."
                data={combineStrategyOptions}
                value={combineStrategy}
                allowDeselect={false}
                onChange={(value) =>
                  value && acceptsCombineStrategy(value) && setCombineStrategy(value)
                }
              />
            )}
            <ModuloControl value={modulo} onChange={setModulo} />
          </InspectorSection>

          <ModuleInspectorContent>
            <InspectorSection label="Inputs">
              <SourceMenu
                label="A"
                placeholder="Connect a numeric source"
                options={aOptions}
                value={bindingA?.source ? outputRefKey(bindingA.source) : null}
                onChange={(value) => onBind('a', value ? parseOutputRef(value) : null)}
              />
              {!bindingA?.source && (
                <NumberInput
                  aria-label="A fallback value"
                  label="A fallback"
                  value={fallbackA}
                  onChange={setFallbackA}
                />
              )}
              {!isUnary && (
                <>
                  <SourceMenu
                    label="B"
                    placeholder="Connect a numeric source"
                    options={aOptions}
                    value={bindingB?.source ? outputRefKey(bindingB.source) : null}
                    onChange={(value) => onBind('b', value ? parseOutputRef(value) : null)}
                  />
                  {!bindingB?.source && (
                    <NumberInput
                      aria-label="B fallback value"
                      label="B fallback"
                      value={fallbackB}
                      onChange={setFallbackB}
                    />
                  )}
                </>
              )}
            </InspectorSection>
            <ModuleOutputsSection instanceLabel={instanceLabel} outputs={publishedOutputs} />
          </ModuleInspectorContent>
        </>
      }
    >
      {view}
    </ModuleDevice>
  );
}
