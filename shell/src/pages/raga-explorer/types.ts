/** One row of the exported masterlist: one raga variant (a raga + one distinct scale). Field names are kept short
 * because this ships as raw JSON (public/raga-explorer/ragas.json, ~9.5k rows) — see scripts/export_raga_explorer_data.py
 * in raga-explorer/ for exactly how each field is derived from MASTERLIST-carnatic-ragas.csv. */
export interface RagaVariant {
  id: string; // Raga ID: shared by every variant of the same raga
  vid: string; // Variant ID: unique to this scale
  type: string; // 'Janya' | 'Melakarta'
  mela: number | null;
  melaName: string;
  name: string;
  aroha: string; // Carnatic sargam text, e.g. "S R1 G1 M1 P D1 N1 S"
  avaroha: string;
  arohaChain: number[]; // canonical semitone chain (Sa=0, upper Sa=12), octave-mark-independent -- see canonical_chain.py
  avarohaChain: number[];
  vakra: string; // 'Yes' | 'No' | 'Mixed' | ''
  bhashanga: string; // 'Yes' | 'No' | 'Unknown' | 'Needs Review' | 'Conflict' | ''
  status: string;
  sources: string[];
  sourceCount: number;
  twinGroup: string | null; // an exact-scale-duplicate group id, shared with every OTHER raga that has this identical scale
  twinCount: number;
  sameNameOtherMelas: string[]; // Raga IDs of a raga with this same name under a different melakarta
  similarNamesNotMerged: string[]; // Raga IDs of a close-spelling raga judged NOT the same raga
  multiParentGroup: string | null; // a group id shared by ragas the sources list under more than one melakarta
  alsoListedUnderMelas: number[];
  allSpellings: string;
  aliasNames: string;
}

export interface MelaRef {
  number: number;
  name: string;
}

export interface RagaExplorerDataset {
  ragas: RagaVariant[];
  melas: MelaRef[];
}
