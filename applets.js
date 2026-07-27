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
  { title: 'Color Checker', href: 'color-checker/', category: 'colour', status: 'maintained', runtime: 'Static browser app', mark: 'colour', description: 'Inspect named colours, contrast, and palette relationships.' },
  { title: 'Palette Chroma', href: 'palette-chroma/', category: 'colour', status: 'maintained', runtime: 'Static browser app', mark: 'colour', description: 'Derive high-chroma colour ramps and inspect their perceptual progression.' },
  { title: 'Username Seeds', href: 'username-seeds/', category: 'language', status: 'maintained', runtime: 'Static browser app', mark: 'words', description: 'Generate time-derived name fragments from editable local word lists.' },
  { title: 'Polygon New Tab', href: 'polygon-new-tab/newtab.html', category: 'utility', status: 'maintained', runtime: 'Browser new-tab page', mark: 'polygon', description: 'A polygon-themed browser new-tab experience.' },
  { title: 'Custom Reader', href: 'custom-reader/', category: 'utility', status: 'maintained', runtime: 'Static browser app plus local feed build', mark: 'words', description: 'Read a curated digest compiled from selected feeds and sorted by recency.' },
  { title: 'PDF Ingest', href: 'pdf-ingest/', category: 'utility', status: 'maintained', runtime: 'Local Python service', mark: 'document', description: 'Convert PDFs into LLM-readable Markdown, with table, image, and OCR options.' }
];

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
        <div class="card-top"><span>${applet.category}</span><span class="card-top-right"><span class="status status-${applet.status}">${applet.status}</span><span>${String(index + 1).padStart(2, '0')}</span></span></div>
        <div class="card-mark mark-${applet.mark}" aria-hidden="true"></div>
        <h2>${applet.title}</h2>
        <p>${applet.description}</p>
        <p class="runtime">${applet.runtime}</p>
        <a class="launch" href="${applet.href}">Open applet</a>
      </article>`).join('')
    : '<p class="empty">No applets match that search.</p>';
}

search.addEventListener('input', renderApplets);
renderFilters();
renderApplets();
