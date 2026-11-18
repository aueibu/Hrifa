import type { CompositionModuleId } from '../compositionWorkspace';
import type { SignalTypeId } from '../signalTypes';

export interface ModulePort {
  id: string;
  signalType: SignalTypeId;
}

/**
 * The inlets of each routed module. The mixer's inlets are its channels, which the receiver's route
 * state owns, so it declares none here; an empty list still marks it as a routed module. Pure data
 * (no component imports) so the canvas can read it too.
 */
export const modulePorts: Partial<Record<CompositionModuleId, ModulePort[]>> = {
  mixer: [],
  melodicization: [
    { id: 'rhythm', signalType: 'rhythm' },
    { id: 'pitches', signalType: 'pitch' },
  ],
  arithmetic: [
    { id: 'a', signalType: 'numeric' },
    { id: 'b', signalType: 'numeric' },
  ],
  'scale-evolution': [{ id: 'sequence', signalType: 'numeric' }],
  'rhythm-householder': [
    { id: 'rhythm', signalType: 'rhythm' },
    { id: 'axis', signalType: 'numeric' },
  ],
  'rhythm-edit': [{ id: 'rhythm', signalType: 'rhythm' }],
};
