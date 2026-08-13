export interface Applet {
  title: string;
  href: string;
  category: string;
  status: 'maintained' | 'experimental';
  runtime: string;
  description: string;
}

export const applets: Applet[] = [
  {
    title: 'Lines & Marks',
    href: 'lines-and-marks/',
    category: 'drawing',
    status: 'maintained',
    runtime: 'Static browser app',
    description: 'An ink-like space for drawing lines, marks, and implied forms.',
  },
  {
    title: 'Hrifa Edel',
    href: 'hrifa-edel/',
    category: 'drawing',
    status: 'maintained',
    runtime: 'Static browser app',
    description:
      'Construct attached polygon relics, mark their edges, and export geometric or ink-rendered studies.',
  },
  {
    title: 'Grid Traversal',
    href: 'grid-traversal/',
    category: 'simulation',
    status: 'maintained',
    runtime: 'Static browser app',
    description:
      'Author cyclic piece programs, place tokens, and inspect how energy and field state settle a board.',
  },
  {
    title: "A Stone's Throw",
    href: 'a-stone-throw/',
    category: 'simulation',
    status: 'experimental',
    runtime: 'Static browser app; online physics modules',
    description:
      'Drop material-based objects onto a surface and inspect a physically simulated landing pattern.',
  },
  {
    title: 'Annulus Explorer',
    href: 'polygon-annulus-explorer/',
    category: 'geometry',
    status: 'maintained',
    runtime: 'Static browser app',
    description: 'Enumerate lattice polygons that contain a disk annulus, up to congruence.',
  },
  {
    title: 'Focus Vantage',
    href: 'polygon-focus-vantage/',
    category: 'geometry',
    status: 'experimental',
    runtime: 'Static browser app',
    description: 'Explore polygonal focus points and changing points of view.',
  },
  {
    title: 'Fold Explorer',
    href: 'polygon-fold-explorer/',
    category: 'geometry',
    status: 'experimental',
    runtime: 'Static browser app',
    description: 'Study folds, reflections, and the generated space of polygonal transformations.',
  },
  {
    title: 'Affine Focus',
    href: 'affine-focus-transform-explorer/',
    category: 'geometry',
    status: 'experimental',
    runtime: 'Static browser app',
    description: 'Explore affine focus transformations and their finite closure graph.',
  },
  {
    title: 'Irregular 3D',
    href: 'polygon-irregular-3d/',
    category: 'geometry',
    status: 'experimental',
    runtime: 'Static browser app',
    description: 'Investigate irregular polygons as spatial cross-section sweeps.',
  },
  {
    title: 'Triangle Construction',
    href: 'three-radii-triangle-construction/',
    category: 'geometry',
    status: 'maintained',
    runtime: 'Static browser app',
    description:
      'Build three linked triangles from a shared pool of three radii using a compass-and-straightedge rule set.',
  },
  {
    title: 'Color Checker',
    href: 'color-checker/',
    category: 'color',
    status: 'maintained',
    runtime: 'Static browser app',
    description: 'Inspect named colors, contrast, and palette relationships.',
  },
  {
    title: 'Palette Chroma',
    href: 'palette-chroma/',
    category: 'color',
    status: 'maintained',
    runtime: 'Static browser app',
    description: 'Derive high-chroma color ramps and inspect their perceptual progression.',
  },
  {
    title: 'Username Seeds',
    href: '/username-seeds',
    category: 'language',
    status: 'maintained',
    runtime: 'Static browser app',
    description: 'Generate time-derived name fragments from editable local word lists.',
  },
  {
    title: 'Polygon New Tab',
    href: 'polygon-new-tab/newtab.html',
    category: 'utility',
    status: 'maintained',
    runtime: 'Browser new-tab page',
    description: 'A polygon-themed browser new-tab experience.',
  },
  {
    title: 'Custom Reader',
    href: 'custom-reader/',
    category: 'utility',
    status: 'maintained',
    runtime: 'Static browser app plus local feed build',
    description: 'Read a curated digest compiled from selected feeds and sorted by recency.',
  },
  {
    title: 'PDF Ingest',
    href: 'pdf-ingest/',
    category: 'utility',
    status: 'maintained',
    runtime: 'Local Python service',
    description: 'Convert PDFs into LLM-readable Markdown, with table, image, and OCR options.',
  },
  {
    title: 'Concentric Polygon Drift',
    href: 'concentric-polygon-drift/',
    category: 'geometry',
    status: 'experimental',
    runtime: 'Static browser app',
    description:
      'Watch nested polygons rotate and drift around a shared center, and inspect their changing aspects.',
  },
  {
    title: 'Point Construction',
    href: '/point-construction',
    category: 'geometry',
    status: 'experimental',
    runtime: 'Static browser app',
    description:
      'Generate points on a grid and resolve each into a line, arc, circle, or point via a two-phase role-then-execute rule set.',
  },
  {
    title: 'Radial Growth Tree',
    href: '/radial-growth-tree',
    category: 'geometry',
    status: 'experimental',
    runtime: 'Static browser app',
    description:
      'Project a polyhedron onto a toroidal lattice, mix it with a cat-map, and grow a directed-ray branching tree from a chosen origin.',
  },
];
