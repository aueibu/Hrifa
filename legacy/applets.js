// The workbench catalogue is the source of truth for portal-visible applets.
// status: maintained = supported working tool; experimental = active research prototype.
// runtime describes what a visitor needs before the applet will work.
const applets = [
  { title: 'Lines & Marks', href: 'lines-and-marks/', category: 'drawing', status: 'maintained', runtime: 'Static browser app', mark: 'draw', description: 'An ink-like space for drawing lines, marks, and implied forms.' },
  { title: 'Hrifa Edel', href: 'hrifa-edel/', category: 'drawing', status: 'maintained', runtime: 'Static browser app', mark: 'polygon', description: 'Construct attached polygon relics, mark their edges, and export geometric or ink-rendered studies.' },
  { title: 'Grid Traversal', href: 'grid-traversal/', category: 'simulation', status: 'maintained', runtime: 'Static browser app', mark: 'grid', description: 'Author cyclic piece programs, place tokens, and inspect how energy and field state settle a board.' },
  { title: "A Stone's Throw", href: 'a-stone-throw/', category: 'simulation', status: 'experimental', runtime: 'Static browser app; online physics modules', mark: 'throw', description: 'Drop material-based objects onto a surface and inspect a physically simulated landing pattern.' },
  { title: 'Annulus Explorer', href: 'polygon-annulus-explorer/', category: 'geometry', status: 'maintained', runtime: 'Static browser app', mark: 'annulus', description: 'Enumerate lattice polygons that contain a disk annulus, up to congruence.' },
  { title: 'Focus Vantage', href: 'polygon-focus-vantage/', category: 'geometry', status: 'experimental', runtime: 'Static browser app', mark: 'polygon', description: 'Explore polygonal focus points and changing points of view.' },
  { title: 'Fold Explorer', href: 'polygon-fold-explorer/', category: 'geometry', status: 'experimental', runtime: 'Static browser app', mark: 'fold', description: 'Study folds, reflections, and the generated space of polygonal transformations.' },
  { title: 'Affine Focus', href: 'affine-focus-transform-explorer/', category: 'geometry', status: 'experimental', runtime: 'Static browser app', mark: 'affine', description: 'Explore affine focus transformations and their finite closure graph.' },
  { title: 'Irregular 3D', href: 'polygon-irregular-3d/', category: 'geometry', status: 'experimental', runtime: 'Static browser app', mark: '3d', description: 'Investigate irregular polygons as spatial cross-section sweeps.' },
  { title: 'Triangle Construction', href: 'three-radii-triangle-construction/', category: 'geometry', status: 'maintained', runtime: 'Static browser app', mark: 'triangle', description: 'Build three linked triangles from a shared pool of three radii using a compass-and-straightedge rule set.' },
  { title: 'Color Checker', href: 'color-checker/', category: 'colour', status: 'maintained', runtime: 'Static browser app', mark: 'colour', description: 'Inspect named colours, contrast, and palette relationships.' },
  { title: 'Palette Chroma', href: 'palette-chroma/', category: 'colour', status: 'maintained', runtime: 'Static browser app', mark: 'chroma', description: 'Derive high-chroma colour ramps and inspect their perceptual progression.' },
  { title: 'Username Seeds', href: 'username-seeds/', category: 'language', status: 'maintained', runtime: 'Static browser app', mark: 'words', description: 'Generate time-derived name fragments from editable local word lists.' },
  { title: 'Polygon New Tab', href: 'polygon-new-tab/newtab.html', category: 'utility', status: 'maintained', runtime: 'Browser new-tab page', mark: 'newtab', description: 'A polygon-themed browser new-tab experience.' },
  { title: 'Custom Reader', href: 'custom-reader/', category: 'utility', status: 'maintained', runtime: 'Static browser app plus local feed build', mark: 'reader', description: 'Read a curated digest compiled from selected feeds and sorted by recency.' },
  { title: 'PDF Ingest', href: 'pdf-ingest/', category: 'utility', status: 'maintained', runtime: 'Local Python service', mark: 'document', description: 'Convert PDFs into LLM-readable Markdown, with table, image, and OCR options.' },
  { title: 'Concentric Polygon Drift', href: 'concentric-polygon-drift/', category: 'geometry', status: 'experimental', runtime: 'Static browser app', mark: 'drift', description: 'Watch nested polygons rotate and drift around a shared center, and inspect their changing aspects.' },
  { title: 'Point Construction', href: 'point-construction/', category: 'geometry', status: 'experimental', runtime: 'Static browser app', mark: 'construct', description: 'Generate points on a grid and resolve each into a line, arc, circle, or point via a two-phase role-then-execute rule set.' }
];

// Each mark is drawn in a normalized 100x36 viewBox, independent of the
// pixel size .card-mark actually renders at (see portal.css) — resizing the
// display window is a CSS change only, never a per-shape recompute.
const marks = {
  draw: () => '<svg viewBox="0 0 100 36" preserveAspectRatio="none"><path d="M21,15 C21,9 28,5 35,6 C44,7 47,13 46,19 C44,26 35,29 27,26 C20,23 19,21 21,15 Z"/><line x1="58" y1="25" x2="92" y2="12"/></svg>',
  polygon: () => '<svg viewBox="0 0 100 36" preserveAspectRatio="none"><rect x="26" y="4" width="24" height="24" transform="rotate(18 38 16)"/><rect x="52" y="10" width="17" height="17" class="i-red" transform="rotate(-18 60.5 18.5)"/></svg>',
  grid: () => '<svg viewBox="0 0 100 36" preserveAspectRatio="none"><rect x="30" y="4" width="26" height="26"/><line x1="39" y1="4" x2="39" y2="30"/><line x1="47" y1="4" x2="47" y2="30"/><line x1="30" y1="13" x2="56" y2="13"/><line x1="30" y1="21" x2="56" y2="21"/><circle class="i-fill i-red" cx="47" cy="21" r="2.5"/></svg>',
  throw: () => '<svg viewBox="0 0 100 36" preserveAspectRatio="none"><path d="M14,27 Q28,5 54,17"/><path d="M54,17 Q68,22 76,27" style="stroke-dasharray:5 4"/><circle class="i-fill" cx="20" cy="30" r="4"/><circle class="i-fill i-red" cx="54" cy="22" r="4"/></svg>',
  annulus: () => '<svg viewBox="0 0 100 36" preserveAspectRatio="none"><circle cx="38" cy="18" r="15"/><circle class="i-red" cx="38" cy="18" r="7"/></svg>',
  triangle: () => '<svg viewBox="0 0 100 36" preserveAspectRatio="none"><circle cx="42" cy="12" r="7.7" style="stroke-width:4"/><circle cx="52" cy="21.5" r="13" style="stroke-width:4"/><circle class="i-fill i-red" cx="39.2" cy="19.1" r="3.8"/><line class="i-blue" x1="40" y1="10" x2="44" y2="14" style="stroke-width:4;stroke-linecap:round"/><line class="i-blue" x1="44" y1="10" x2="40" y2="14" style="stroke-width:4;stroke-linecap:round"/><circle class="i-fill" cx="52" cy="21.5" r="3"/></svg>',
  fold: () => '<svg viewBox="0 0 100 36" preserveAspectRatio="none"><polygon points="20,33 22,15 40,8 55.5,8 55.5,17 68,25 20,33" style="stroke-width:4;stroke-linejoin:round"/><line x1="19.5" y1="25" x2="54" y2="16.5" style="stroke-width:1;stroke-dasharray:4 4"/><circle class="i-fill i-red" cx="54.5" cy="3.7" r="2.8"/></svg>',
  affine: () => '<svg viewBox="0 0 100 36" preserveAspectRatio="none"><rect x="24" y="8" width="30" height="18" transform="skewX(-20)"/><circle class="i-fill i-blue" cx="70" cy="24" r="2.5"/></svg>',
  '3d': () => '<svg viewBox="0 0 100 36" preserveAspectRatio="none"><path d="M34,32 C42,32 48,31 50,26 C51,21 51,18 55,15 C60,11 65,8 70,7 C74,6 77,7 80,7"/><path d="M30,27 C36,24 42,27 48,31 C50,33 51,35 50,36"/><path class="i-red" d="M34,16 C39,11 44,10 49,12 C55,14 55,20 61,24"/><path class="i-blue" d="M60,5 C65,4 69,3 72,5 C75,8 76,12 78,15 C79,17 78,18 77,19"/></svg>',
  words: () => '<svg viewBox="0 0 100 36" preserveAspectRatio="none"><ellipse cx="36" cy="18" rx="22" ry="9"/><circle class="i-fill i-red" cx="20" cy="18" r="1.8"/><circle class="i-fill i-blue" cx="48" cy="10" r="1.8"/><circle class="i-fill" cx="70" cy="23" r="1.8"/></svg>',
  newtab: () => '<svg viewBox="0 0 100 36" preserveAspectRatio="none"><path d="M27,4 L48,4 Q52,4 52,8 L52,24 Q52,28 48,28 L27,28 Z"/><polygon class="i-red" points="39,14 39,27.5 50.3,35 55.6,24.4 74,25.3"/><polygon points="53,19 66.4,12 70.9,11 67.2,19.5 75,26 65.5,34"/></svg>',
  colour: (i) => `<svg viewBox="0 0 100 36" preserveAspectRatio="none"><defs><linearGradient id="g-colour-${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--portal-icon-blue)"/><stop offset="0.5" stop-color="var(--portal-icon-lime)"/><stop offset="1" stop-color="var(--portal-icon-red)"/></linearGradient></defs><rect class="i-gradient" x="18" y="14" width="50" height="8" style="fill:url(#g-colour-${i});stroke:none"/><circle cx="80" cy="18" r="6"/></svg>`,
  chroma: () => '<svg viewBox="0 0 100 36" preserveAspectRatio="none"><line x1="14" y1="30" x2="90" y2="11"/><circle cx="25" cy="23.6" r="3.8" style="fill:var(--portal-icon-lime);stroke:none"/><circle class="i-fill i-red" cx="46" cy="16.7" r="5.4"/><circle class="i-fill i-blue" cx="70" cy="9.4" r="7.2"/></svg>',
  reader: () => '<svg viewBox="0 0 100 36" preserveAspectRatio="none"><path d="M18,26 L18,5 L82,5 L82,25"/><rect class="i-blue" x="23" y="9" width="16" height="15"/><rect class="i-red" x="46" y="9" width="16" height="13"/><line x1="66" y1="7" x2="66" y2="35"/></svg>',
  document: () => '<svg viewBox="0 0 100 36" preserveAspectRatio="none"><rect x="16" y="1.2" width="26" height="33.6"/><line x1="21.6" y1="8.5" x2="36.4" y2="8.5"/><line x1="21.6" y1="15" x2="36.4" y2="15"/><line x1="21.6" y1="21.5" x2="36.4" y2="21.5"/><path class="i-red" d="M36.4,8.5 L42,8.5 L67,21.5"/><path class="i-red" d="M36.4,15 L42,15 L67,21.5"/><path class="i-red" d="M36.4,21.5 L86,21.5"/></svg>',
  drift: () => '<svg viewBox="0 0 100 36" preserveAspectRatio="none"><circle cx="50" cy="18" r="16"/><rect class="i-red" x="38" y="6" width="24" height="24" transform="rotate(15 50 18)"/><circle class="i-fill i-blue" cx="50" cy="18" r="2.5"/></svg>',
  construct: () => '<svg viewBox="0 0 100 36" preserveAspectRatio="none"><line x1="14" y1="30" x2="38" y2="10"/><circle class="i-red" cx="62" cy="20" r="10"/><path class="i-blue" d="M74,9 Q88,18 74,29"/><circle class="i-fill" cx="14" cy="30" r="2.6"/><circle class="i-fill" cx="38" cy="10" r="2.6"/></svg>',
};

const grid = document.querySelector('#applet-grid');
const filters = document.querySelector('#filters');
const search = document.querySelector('#search');
const count = document.querySelector('#count');
let activeCategory = 'all';

function renderFilters() {
  filters.innerHTML = '';
  ['all', ...new Set(applets.map(({ category }) => category))].forEach((category) => {
    const button = document.createElement('button');
    button.className = `filter${category === activeCategory ? ' active' : ''}`;
    button.textContent = category;
    button.addEventListener('click', () => {
      activeCategory = category;
      renderFilters();
      renderApplets();
    });
    filters.append(button);
  });
}

function renderApplets() {
  const term = search.value.trim().toLowerCase();
  const visible = applets.filter((applet) => (
    (activeCategory === 'all' || applet.category === activeCategory)
    && `${applet.title} ${applet.category} ${applet.status} ${applet.runtime} ${applet.description}`.toLowerCase().includes(term)
  ));
  count.textContent = `${visible.length} ${visible.length === 1 ? 'applet' : 'applets'}`;
  grid.innerHTML = visible.length
    ? visible.map((applet, index) => `<article class="card">
        <div class="card-top"><span class="card-tag">${applet.category}<span class="info-dot" tabindex="0" data-tip="${applet.runtime}">i</span></span><span class="card-top-right"><span class="status status-${applet.status}">${applet.status}</span><span>${String(index + 1).padStart(2, '0')}</span></span></div>
        <div class="card-mark" aria-hidden="true">${marks[applet.mark](index)}</div>
        <h2>${applet.title}</h2>
        <p>${applet.description}</p>
        <a class="launch" href="${applet.href}" target="_blank" rel="noopener" aria-label="Open ${applet.title} applet"></a>
      </article>`).join('')
    : '<p class="empty">No applets match that search.</p>';
}

// The compact header fades in once the full hero has scrolled fully out of
// view. IntersectionObserver (rather than a scroll listener) means there's
// no per-pixel threshold to tune and no layout-shift feedback loop.
const heroCompact = document.querySelector('#heroCompact');
const heroEl = document.querySelector('.hero');
new IntersectionObserver(([entry]) => {
  heroCompact.classList.toggle('visible', !entry.isIntersecting);
}).observe(heroEl);

search.addEventListener('input', renderApplets);
renderFilters();
renderApplets();
