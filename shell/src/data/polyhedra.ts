import rawPolyhedra from './polyhedra.json';

export type SolidClass =
  | 'Platonic'
  | 'Archimedean'
  | 'Catalan'
  | 'Johnson'
  | 'Prism'
  | 'Antiprism'
  | 'Irregular';

export interface Solid {
  klass: SolidClass;
  label: string;
  /** Vertex coordinates, already canonicalized so z is the projection axis. */
  v: [number, number, number][];
  edges: [number, number][];
  /** Vertex-index loops. Absent for Catalan solids (no face data in the source dataset). */
  faces?: number[][];
}

/**
 * George Hart's Virtual Polyhedra dataset (Platonic, Archimedean, Catalan,
 * Johnson, Prism, Antiprism), each canonicalized into its projection frame.
 * The raw JSON carries 139 solids; `shearedTetrahedron` is the one hand-added
 * Irregular example, matching the prototype.
 */
export const SOLIDS: Record<string, Solid> = {
  ...(rawPolyhedra as unknown as Record<string, Solid>),
  shearedTetrahedron: {
    klass: 'Irregular',
    label: 'Sheared Tetrahedron',
    v: [
      [0, 0, 1],
      [0.942809, 0, -0.333333],
      [0.345093, 0.816497, -0.333333],
      [-1.287901, -0.816497, -0.333333],
    ],
    edges: [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ],
    faces: [
      [0, 1, 2],
      [0, 2, 3],
      [0, 3, 1],
      [1, 3, 2],
    ],
  },
};

export const solidClasses: SolidClass[] = [
  'Platonic',
  'Archimedean',
  'Catalan',
  'Johnson',
  'Prism',
  'Antiprism',
  'Irregular',
];

/** Every [key, solid] pair whose class matches, in dataset order. */
export function solidsForClass(klass: SolidClass): [string, Solid][] {
  return Object.entries(SOLIDS).filter(([, solid]) => solid.klass === klass);
}
