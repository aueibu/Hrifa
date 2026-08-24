import { useEffect, useMemo } from 'react';
import { Alert, Badge, Group, NumberInput, Select, Stack, Text, Title } from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import {
  arithmeticOperatorDefaults,
  arithmeticOperatorLabels,
  computeArithmetic,
  formatNumericTree,
  rawNumericTree,
  type ArithmeticOperator,
} from '../arithmetic';
import {
  boundOutput,
  compositionOutputOptions,
  outputRefKey,
  parseOutputRef,
  resolvePacketFromOutput,
  type CompositionModuleRoutingProps,
  type CompositionOutputRef,
  type PublishedCompositionOutput,
} from '../compositionRouting';
import { useCompositionSettings } from '../compositionSettings';
import type { ModuleRouteState } from '../compositionWorkspace';
import type { PitchAllocation } from '../melodicization';
import { defaultModuloTreatment, type ModuloTreatment } from '../moduloTreatment';
import type { DataPacket } from '../model';
import { signalTypeRegistry } from '../signalTypes';
import {
  acceptsNumberOrString,
  compositionStateKeys,
  compositionInstanceStateKey,
  usePersistentState,
} from '../usePersistentState';
import { ModuloControl } from './ModuloControl';
import { Module, ModuleOutput, ModuleSection } from './Module';
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
  // A binding pointing at this same instance (stale data, or otherwise) would feed the
  // module's own output back into itself: a new packet object every render, which never
  // reads as "unchanged" downstream and infinite-loops the composition view. Treat it as
  // disconnected rather than crash.
  const selfBoundA = bindingA?.source?.instanceId === instanceId;
  const selfBoundB = bindingB?.source?.instanceId === instanceId;
  const outputA = boundOutput(outputs, bindingA?.source);
  const outputB = boundOutput(outputs, bindingB?.source);
  const resolvedA = useMemo(
    () =>
      selfBoundA ? undefined : resolvePacketFromOutput(outputA, bindingA?.source?.index, `route:${instanceId}:a`),
    [selfBoundA, outputA, bindingA?.source?.index, instanceId]
  );
  const resolvedB = useMemo(
    () =>
      selfBoundB ? undefined : resolvePacketFromOutput(outputB, bindingB?.source?.index, `route:${instanceId}:b`),
    [selfBoundB, outputB, bindingB?.source?.index, instanceId]
  );
  const treatedA = useMemo(
    () =>
      bindingA
        ? signalTypeRegistry[bindingA.signalType].apply(resolvedA, bindingA.treatment, `route:${instanceId}:a`, edo)
        : undefined,
    [bindingA, resolvedA, instanceId, edo]
  );
  const treatedB = useMemo(
    () =>
      bindingB
        ? signalTypeRegistry[bindingB.signalType].apply(resolvedB, bindingB.treatment, `route:${instanceId}:b`, edo)
        : undefined,
    [bindingB, resolvedB, instanceId, edo]
  );

  const result = useMemo(
    () =>
      computeArithmetic({
        instanceId,
        operator,
        a: treatedA,
        b: treatedB,
        fallbackA: Number(fallbackA) || 0,
        fallbackB: Number(fallbackB) || 0,
        combineStrategy,
        modulo,
        edo,
      }),
    [instanceId, operator, treatedA, treatedB, fallbackA, fallbackB, combineStrategy, modulo, edo]
  );

  const publishedOutput = useMemo<PublishedCompositionOutput>(
    () => ({
      ref: { instanceId, port: 'result' },
      label: `${instanceLabel} · Result`,
      packet: result.packet,
    }),
    [instanceId, instanceLabel, result.packet]
  );

  useEffect(() => {
    onOutputsChange?.(instanceId, [publishedOutput]);
  }, [instanceId, onOutputsChange, publishedOutput]);

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

  return (
    <Surface className={classes.interferenceSurface}>
      <div className={classes.interferenceLayout}>
        <div className={classes.resultInspector}>
          <Group justify="space-between" align="start" mb="md">
            <div>
              <Title order={2} size="h3">
                {instanceLabel}
              </Title>
              <Text c="dimmed" size="sm">
                {arithmeticOperatorLabels[operator]} applied to A{isUnary ? '' : ' and B'}.
              </Text>
            </div>
            <Group gap="xs">
              <Badge variant="outline">{result.packet.items.length} items</Badge>
              <Badge variant="outline">{result.packet.domain}</Badge>
            </Group>
          </Group>

          {result.messages.length > 0 && (
            <Alert color="yellow" title="Arithmetic report">
              {result.messages.join(' ')}
            </Alert>
          )}

          <Stack gap={2}>
            <Text size="xs" c="dimmed">
              A raw: <Text span ff="monospace">{rawOperandLine(treatedA, Number(fallbackA) || 0)}</Text>
            </Text>
            {!isUnary && (
              <Text size="xs" c="dimmed">
                B raw: <Text span ff="monospace">{rawOperandLine(treatedB, Number(fallbackB) || 0)}</Text>
              </Text>
            )}
            <Text size="xs" c="dimmed">
              Result raw:{' '}
              <Text span ff="monospace">
                {result.packet.items
                  .slice(0, 64)
                  .map((item) => formatNumericTree(rawNumericTree(item.value)))
                  .join(', ')}
                {result.packet.items.length > 64 ? `, … (${result.packet.items.length} items)` : ''}
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
        </div>

        <Module
          name={instanceLabel}
          status={`${result.packet.items.length} items`}
          output={<ModuleOutput name="Result" packet={result.packet} />}
        >
          <ModuleSection label="Inputs" grow>
            <Stack gap="xs">
              <Select
                size="xs"
                label="A"
                placeholder="Connect a numeric source"
                clearable
                data={aOptions}
                value={bindingA?.source ? outputRefKey(bindingA.source) : null}
                onChange={(value) => onBind('a', value ? parseOutputRef(value) : null)}
              />
              {!bindingA?.source && (
                <NumberInput
                  size="xs"
                  aria-label="A fallback value"
                  label="A fallback"
                  value={fallbackA}
                  onChange={setFallbackA}
                />
              )}
              {!isUnary && (
                <>
                  <Select
                    size="xs"
                    label="B"
                    placeholder="Connect a numeric source"
                    clearable
                    data={aOptions}
                    value={bindingB?.source ? outputRefKey(bindingB.source) : null}
                    onChange={(value) => onBind('b', value ? parseOutputRef(value) : null)}
                  />
                  {!bindingB?.source && (
                    <NumberInput
                      size="xs"
                      aria-label="B fallback value"
                      label="B fallback"
                      value={fallbackB}
                      onChange={setFallbackB}
                    />
                  )}
                </>
              )}
            </Stack>
          </ModuleSection>

          <ModuleSection label="Operation">
            <Stack gap="xs">
              <Select
                size="xs"
                label="Operator"
                data={operatorOptions}
                value={operator}
                allowDeselect={false}
                onChange={changeOperator}
              />
              {showCombineStrategy && (
                <Select
                  size="xs"
                  label="Combine strategy"
                  description="A and B are different lengths."
                  data={combineStrategyOptions}
                  value={combineStrategy}
                  allowDeselect={false}
                  onChange={(value) => value && acceptsCombineStrategy(value) && setCombineStrategy(value)}
                />
              )}
              <ModuloControl value={modulo} onChange={setModulo} />
            </Stack>
          </ModuleSection>
        </Module>
      </div>
    </Surface>
  );
}
