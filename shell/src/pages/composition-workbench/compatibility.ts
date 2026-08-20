import type { AcceptedPacket, DataPacket } from './model';

export type CompatibilityGroup = 'direct' | 'combine' | 'interpret';

export interface CompatibleOperation {
  id: string;
  title: string;
  description: string;
  group: CompatibilityGroup;
  accepts: AcceptedPacket[];
  target?: {
    moduleId: string;
    port: string;
  };
}

export const compatibilityGroupLabels: Record<CompatibilityGroup, string> = {
  direct: 'Direct operations',
  combine: 'Musical combinations',
  interpret: 'Interpretations',
};

const cyclicInterOnsetDurations: AcceptedPacket = {
  kind: 'list',
  domain: 'duration',
  roles: ['interOnset'],
  topologies: ['cyclic'],
};

const pitchLists: AcceptedPacket[] = [
  { kind: 'list', domain: 'pitch', roles: ['pitchMaterial'] },
  { kind: 'list', domain: 'pitchClass', roles: ['pitchMaterial'] },
];

export const compatibleOperations: CompatibleOperation[] = [
  {
    id: 'slice',
    title: 'Slice',
    description: 'Extract a contiguous region while retaining its source relationship.',
    group: 'direct',
    accepts: [cyclicInterOnsetDurations],
  },
  {
    id: 'rotate',
    title: 'Rotate',
    description: 'Choose a different origin for the cycle.',
    group: 'direct',
    accepts: [cyclicInterOnsetDurations],
  },
  {
    id: 'repeat',
    title: 'Repeat',
    description: 'Repeat the cycle into a longer framed list.',
    group: 'direct',
    accepts: [cyclicInterOnsetDurations],
  },
  {
    id: 'scale-durations',
    title: 'Scale durations',
    description: 'Multiply duration values and the enclosing extent together.',
    group: 'direct',
    accepts: [cyclicInterOnsetDurations],
  },
  {
    id: 'regroup',
    title: 'Regroup',
    description: 'Change grouping without altering the underlying durations.',
    group: 'direct',
    accepts: [cyclicInterOnsetDurations],
  },
  {
    id: 'assign-pitches',
    title: 'Assign pitches',
    description: 'Pair the durations with pitches to produce notes.',
    group: 'combine',
    accepts: [cyclicInterOnsetDurations],
    target: { moduleId: 'melodicization', port: 'rhythm' },
  },
  {
    id: 'stack-as-layers',
    title: 'Stack as layers',
    description: 'Place copies or slices into simultaneous layers.',
    group: 'combine',
    accepts: [cyclicInterOnsetDurations],
  },
  {
    id: 'to-onsets',
    title: 'Convert to onsets',
    description: 'Accumulate durations into positions in the cycle.',
    group: 'interpret',
    accepts: [cyclicInterOnsetDurations],
  },
  {
    id: 'build-rhythm-tree',
    title: 'Build rhythm tree',
    description: 'Interpret the list as a hierarchical rhythmic structure.',
    group: 'interpret',
    accepts: [cyclicInterOnsetDurations],
  },
  {
    id: 'transpose-pitches',
    title: 'Transpose',
    description: 'Move every pitch or pitch class by an explicit interval.',
    group: 'direct',
    accepts: pitchLists,
  },
  {
    id: 'invert-pitches',
    title: 'Invert',
    description: 'Reflect the list around an explicit pitch or pitch-class axis.',
    group: 'direct',
    accepts: pitchLists,
  },
  {
    id: 'melodicization',
    title: 'Melodicization',
    description: 'Combine pitch material with an inter-onset duration list.',
    group: 'combine',
    accepts: pitchLists,
    target: { moduleId: 'melodicization', port: 'pitches' },
  },
  {
    id: 'voice-pitch-classes',
    title: 'Assign register',
    description: 'Turn pitch classes into concrete pitches using an explicit register policy.',
    group: 'interpret',
    accepts: [{ kind: 'list', domain: 'pitchClass', roles: ['pitchMaterial'] }],
  },
];

export function packetMatches(packet: DataPacket, accepted: AcceptedPacket) {
  return (
    (accepted.kind === '*' || accepted.kind === packet.kind) &&
    (accepted.domain === '*' || accepted.domain === packet.domain) &&
    (!accepted.encodings ||
      (packet.encoding !== undefined && accepted.encodings.includes(packet.encoding))) &&
    (!accepted.roles || (packet.role !== undefined && accepted.roles.includes(packet.role))) &&
    (!accepted.topologies ||
      (packet.frame !== undefined && accepted.topologies.includes(packet.frame.topology)))
  );
}

export function operationsForPacket(packet: DataPacket) {
  return compatibleOperations.filter((operation) =>
    operation.accepts.some((accepted) => packetMatches(packet, accepted))
  );
}
