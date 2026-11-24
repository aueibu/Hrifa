import { computeArithmetic, type ArithmeticOperator } from '../../arithmetic';
import {
  boundOutput,
  resolvePacketFromOutput,
  type PublishedCompositionOutput,
} from '../../compositionRouting';
import type { NodeRouteBinding, NodeRouteState } from '../../compositionWorkspace';
import type { PitchAllocation } from '../../melodicization';
import type { DataPacket } from '../../model';
import type { ModuloTreatment } from '../../moduloTreatment';
import { signalTypeRegistry } from '../../signalTypes';

export interface ArithmeticState {
  operator: ArithmeticOperator;
  fallbackA: number | string;
  fallbackB: number | string;
  combineStrategy: PitchAllocation;
  modulo: ModuloTreatment;
}

/**
 * What Arithmetic reads from upstream: the bound output and the route binding of each port. These
 * are picked out of the full outputs and the route state (`pickArithmeticInputs`) so the inputs
 * keep their identity when an unrelated output changes. Without that, the node's own published
 * result would count as a changed input and it would re-evaluate itself forever.
 */
export interface ArithmeticInputs {
  outputA: PublishedCompositionOutput | undefined;
  outputB: PublishedCompositionOutput | undefined;
  bindingA: NodeRouteBinding | undefined;
  bindingB: NodeRouteBinding | undefined;
}

export interface ArithmeticContext {
  instanceId: string;
  instanceLabel: string;
  edo: number;
}

/** What the label does not touch: a rename keeps this object, and its packet, as it is. */
export interface ArithmeticCore {
  treatedA: DataPacket | undefined;
  treatedB: DataPacket | undefined;
  result: ReturnType<typeof computeArithmetic>;
}

export type ArithmeticEvaluation = ArithmeticCore & { outputs: PublishedCompositionOutput[] };

/**
 * Resolves ports a and b against the published outputs. A binding pointing at this same instance
 * (stale data) would feed the node's own output back into itself, so it reads as disconnected.
 */
export function pickArithmeticInputs(
  outputs: PublishedCompositionOutput[],
  routeState: NodeRouteState,
  instanceId: string
): ArithmeticInputs {
  const bindingA = routeState.a;
  const bindingB = routeState.b;
  return {
    outputA:
      bindingA?.source?.instanceId === instanceId
        ? undefined
        : boundOutput(outputs, bindingA?.source),
    outputB:
      bindingB?.source?.instanceId === instanceId
        ? undefined
        : boundOutput(outputs, bindingB?.source),
    bindingA,
    bindingB,
  };
}

/** Arithmetic: treats each routed operand by its signal type, combines them, publishes `result`. */
export function computeArithmeticNode(
  state: ArithmeticState,
  inputs: ArithmeticInputs,
  ctx: Omit<ArithmeticContext, 'instanceLabel'>
): ArithmeticCore {
  const { instanceId, edo } = ctx;
  const { bindingA, bindingB } = inputs;
  const resolvedA = resolvePacketFromOutput(
    inputs.outputA,
    bindingA?.source?.index,
    `route:${instanceId}:a`
  );
  const resolvedB = resolvePacketFromOutput(
    inputs.outputB,
    bindingB?.source?.index,
    `route:${instanceId}:b`
  );
  const treatedA = bindingA
    ? signalTypeRegistry[bindingA.signalType].apply(
        resolvedA,
        bindingA.treatment,
        `route:${instanceId}:a`,
        edo
      )
    : undefined;
  const treatedB = bindingB
    ? signalTypeRegistry[bindingB.signalType].apply(
        resolvedB,
        bindingB.treatment,
        `route:${instanceId}:b`,
        edo
      )
    : undefined;
  const result = computeArithmetic({
    instanceId,
    operator: state.operator,
    a: treatedA,
    b: treatedB,
    fallbackA: Number(state.fallbackA) || 0,
    fallbackB: Number(state.fallbackB) || 0,
    combineStrategy: state.combineStrategy,
    modulo: state.modulo,
    edo,
  });
  return { treatedA, treatedB, result };
}

/** The published `result` output: the packet from the core, wrapped with the label. */
export function arithmeticOutputs(
  core: ArithmeticCore,
  ctx: Pick<ArithmeticContext, 'instanceId' | 'instanceLabel'>
): PublishedCompositionOutput[] {
  return [
    {
      ref: { instanceId: ctx.instanceId, port: 'result' },
      label: `${ctx.instanceLabel} · Result`,
      packet: core.result.packet,
    },
  ];
}

export function evaluateArithmetic(
  state: ArithmeticState,
  inputs: ArithmeticInputs,
  ctx: ArithmeticContext
): ArithmeticEvaluation {
  const core = computeArithmeticNode(state, inputs, ctx);
  return { ...core, outputs: arithmeticOutputs(core, ctx) };
}
