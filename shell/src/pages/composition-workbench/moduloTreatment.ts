import { positiveModulo } from './alignment';
import type { DataItem } from './model';

export interface ModuloTreatment {
  enabled: boolean;
  divisor: number;
}

export const defaultModuloTreatment: ModuloTreatment = { enabled: false, divisor: 12 };

export function applyModulo(
  items: DataItem<number>[],
  treatment: ModuloTreatment
): DataItem<number>[] {
  if (!treatment.enabled || treatment.divisor === 0) {
    return items;
  }
  return items.map((item) => {
    const value = positiveModulo(item.value, treatment.divisor);
    return {
      ...item,
      value,
      label: String(value),
      provenance: [
        ...item.provenance,
        {
          sourceModuleInstance: item.id,
          sourceItemIds: [item.id],
          transformation: 'modulo',
          parameters: { divisor: treatment.divisor },
        },
      ],
    };
  });
}

export function acceptsModuloTreatment(value: unknown): value is ModuloTreatment {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as ModuloTreatment;
  return typeof candidate.enabled === 'boolean' && Number.isFinite(candidate.divisor);
}
