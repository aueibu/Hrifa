import { findMurchanaMatches, pcsetKey, type MurchanaHit } from './murchana';
import { pitchClassSet, type RagaTheory } from './theory';
import type { MelaRef, RagaExplorerDataset, RagaVariant } from './types';

const DATA_URL = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/raga-explorer/ragas.json`;

let cached: Promise<RagaExplorerDataset> | null = null;

/** Fetches public/raga-explorer/ragas.json once per page session; every caller shares the same in-flight/resolved
 * promise (React 18/19 strict-mode double-mount included). */
export function loadRagaData(): Promise<RagaExplorerDataset> {
  if (!cached) {
    cached = fetch(DATA_URL).then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to load raga data: ${res.status} ${res.statusText}`);
      }
      return res.json() as Promise<RagaExplorerDataset>;
    });
  }
  return cached;
}

export interface RagaIndex {
  ragas: RagaVariant[];
  melas: MelaRef[];
  byVid: Map<string, RagaVariant>;
  /** Every variant sharing a Raga ID -- the sibling scales of one raga. */
  byRagaId: Map<string, RagaVariant[]>;
  /** Every variant sharing a Scale Twin Group id -- ragas with a different name but an identical scale. */
  byTwinGroup: Map<string, RagaVariant[]>;
  byMela: Map<number, RagaVariant[]>;
  /** Every variant whose pitch-class set (pcsetKey() of aroha union avaroha) matches -- order/vakra-independent,
   * unlike byTwinGroup. This is what murchana.ts's rotation search matches against: "does a real raga use exactly
   * this set of pitches", regardless of how it's phrased. */
  byPcset: Map<string, RagaVariant[]>;
}

export function buildIndex(data: RagaExplorerDataset): RagaIndex {
  const byVid = new Map<string, RagaVariant>();
  const byRagaId = new Map<string, RagaVariant[]>();
  const byTwinGroup = new Map<string, RagaVariant[]>();
  const byMela = new Map<number, RagaVariant[]>();
  const byPcset = new Map<string, RagaVariant[]>();
  for (const r of data.ragas) {
    byVid.set(r.vid, r);
    if (!byRagaId.has(r.id)) {
      byRagaId.set(r.id, []);
    }
    byRagaId.get(r.id)!.push(r);
    if (r.twinGroup) {
      if (!byTwinGroup.has(r.twinGroup)) {
        byTwinGroup.set(r.twinGroup, []);
      }
      byTwinGroup.get(r.twinGroup)!.push(r);
    }
    if (r.mela != null) {
      if (!byMela.has(r.mela)) {
        byMela.set(r.mela, []);
      }
      byMela.get(r.mela)!.push(r);
    }
    if (r.aroha.trim() && r.avaroha.trim()) {
      const key = pcsetKey(pitchClassSet(r.aroha, r.avaroha).pcset);
      if (!byPcset.has(key)) {
        byPcset.set(key, []);
      }
      byPcset.get(key)!.push(r);
    }
  }
  return { ragas: data.ragas, melas: data.melas, byVid, byRagaId, byTwinGroup, byMela, byPcset };
}

/** One representative variant per Raga ID (its first, i.e. earliest-built variant) -- used for the raga list/search,
 * which browses ragas, not every individual scale reading of one. */
export function representativeVariants(index: RagaIndex): RagaVariant[] {
  return [...index.byRagaId.values()].map((vs) => vs[0]);
}

/** Ragas with the same name (a real Raga ID reference, not text) under a different melakarta. */
export function sameNameOtherMelas(index: RagaIndex, raga: RagaVariant): RagaVariant[] {
  return raga.sameNameOtherMelas
    .map((id) => index.byRagaId.get(id)?.[0])
    .filter((r): r is RagaVariant => !!r);
}

export function similarNamesNotMerged(index: RagaIndex, raga: RagaVariant): RagaVariant[] {
  return raga.similarNamesNotMerged
    .map((id) => index.byRagaId.get(id)?.[0])
    .filter((r): r is RagaVariant => !!r);
}

/** Every other raga (by name) that shares this exact scale -- one representative variant per raga id, excluding
 * this raga's own id (its own other scale readings are sibling variants, not twins). */
export function scaleTwins(index: RagaIndex, raga: RagaVariant): RagaVariant[] {
  if (!raga.twinGroup) {
    return [];
  }
  const group = index.byTwinGroup.get(raga.twinGroup) ?? [];
  const seen = new Set<string>();
  const out: RagaVariant[] = [];
  for (const r of group) {
    if (r.id === raga.id || seen.has(r.id)) {
      continue;
    }
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

/** Every other scale variant of this same raga (same Raga ID). */
export function siblingVariants(index: RagaIndex, raga: RagaVariant): RagaVariant[] {
  return (index.byRagaId.get(raga.id) ?? []).filter((r) => r.vid !== raga.vid);
}

/** Ragas sharing this raga's Multi-Parent Group -- listed by more than one source under different melakartas. */
export function multiParentSiblings(index: RagaIndex, raga: RagaVariant): RagaVariant[] {
  if (!raga.multiParentGroup) {
    return [];
  }
  const seen = new Set<string>([raga.id]);
  const out: RagaVariant[] = [];
  for (const r of index.ragas) {
    if (r.multiParentGroup === raga.multiParentGroup && !seen.has(r.id)) {
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

export function melaOf(index: RagaIndex, mela: number): MelaRef | undefined {
  return index.melas.find((m) => m.number === mela);
}

/** The melakarta's own row for a given mela number (its parent scale, playable the same way as any janya). */
export function melakartaRaga(index: RagaIndex, mela: number): RagaVariant | undefined {
  return (index.byMela.get(mela) ?? []).find((r) => r.type === 'Melakarta');
}

export interface MurchanaSearches {
  inversions: MurchanaHit[]; // mode-rotations of the raga's OWN scale (excludes the un-rotated case; see Scale twins)
  mirror: MurchanaHit[]; // mode-rotations of the melodic mirror
  negative: MurchanaHit[]; // mode-rotations of the negative/complement scale
}

/** All three murchana (mode-rotation) searches for one raga's theory profile -- see murchana.ts for what each one
 * means and why. */
export function murchanaSearches(
  index: RagaIndex,
  raga: RagaVariant,
  theory: RagaTheory
): MurchanaSearches {
  return {
    inversions: findMurchanaMatches(theory.pcset, index.byPcset, raga.id, 0),
    mirror: findMurchanaMatches(theory.mirrorPcset, index.byPcset, raga.id),
    negative: findMurchanaMatches(theory.negativePcset, index.byPcset, raga.id),
  };
}
