// app.js -- UI wiring, SVG lattice view, and results list for the Annulus
// Polygon Explorer. All enumeration math lives in core.js (LatticeCore);
// this file is purely presentation and interaction.
(function () {
  const LC = window.LatticeCore;
  const $ = (id) => document.getElementById(id);

  const svg = $("stage");
  const THEME_KEY = "annulus-explorer-theme";

  const PRESETS = {
    square: { v1: [1, 0], v2: [0, 1] },
    triangular: { v1: [1, 0], v2: [0.5, Math.sqrt(3) / 2] },
    rectangular: { v1: [1, 0], v2: [0, 1.6] },
  };

  const state = {
    v1: [1, 0], v2: [0, 1],
    minR: 1.5, maxR: 2.6, n: 4,
    checkEdges: true, maxCombos: 500000,
  };

  let lattice = { all: [], annulus: [] };
  let result = null;
  let selectedId = null;
  let hasGeneratedOnce = false;

  const camera = { cx: 0, cy: 0, halfH: 3.5 };
  let panStart = null;

  function round(v, d) {
    const f = Math.pow(10, d);
    return Math.round(v * f) / f;
  }

  // ---------------- theme ----------------

  function applyTheme(dark) {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    const btn = $("themeBtn");
    if (btn) {
      btn.setAttribute("aria-pressed", String(dark));
      btn.textContent = dark ? "Daylight" : "Nightglass";
    }
  }
  function setTheme(dark) {
    try { localStorage.setItem(THEME_KEY, String(dark)); } catch {}
    applyTheme(dark);
  }
  function restoreTheme() {
    let dark = false;
    try {
      const saved = localStorage.getItem(THEME_KEY);
      dark = saved === null ? matchMedia("(prefers-color-scheme: dark)").matches : saved === "true";
    } catch {}
    applyTheme(dark);
  }

  // ---------------- status / floor ratio ----------------

  function setStatus(text, kind) {
    const el = $("statusLine");
    el.textContent = text;
    el.className = "status-line" + (kind ? " " + kind : "");
  }

  function updateFloorRatio() {
    const ratio = state.maxR / state.minR;
    const floor = LC.containmentFloorRatio(state.n);
    const ok = Number.isFinite(ratio) && ratio >= floor - 1e-9;
    $("ratioValue").textContent =
      `${round(ratio, 4)} ${ok ? "≥" : "<"} sec(π/${state.n}) = ${round(floor, 4)}`;
    $("ratioReadout").classList.toggle("fail", !ok);
    return ok;
  }

  // ---------------- input handling ----------------

  function readInputs() {
    state.v1 = [parseFloat($("v1x").value) || 0, parseFloat($("v1y").value) || 0];
    state.v2 = [parseFloat($("v2x").value) || 0, parseFloat($("v2y").value) || 0];
    state.minR = parseFloat($("minRInput").value);
    state.maxR = parseFloat($("maxRInput").value);
    state.n = parseInt($("nInput").value, 10);
    state.checkEdges = $("edgePurityInput").checked;
    state.maxCombos = parseInt($("maxCombosInput").value, 10);
  }

  function onParamsChanged(latticeChanged) {
    result = null;
    selectedId = null;

    if (!(state.minR < state.maxR)) {
      lattice = { all: [], annulus: [] };
      $("latticeMeta").textContent = "minR must be less than maxR.";
      updateFloorRatio();
      renderResults();
      setStatus("minR must be less than maxR.", "err");
      renderStage();
      return;
    }

    if (latticeChanged) {
      try {
        lattice.all = LC.generateLattice(state.v1, state.v2, state.maxR);
        lattice.annulus = LC.annulusPoints(lattice.all, state.minR, state.maxR);
        $("latticeMeta").textContent =
          `${lattice.all.length} lattice points within maxᵣ · ${lattice.annulus.length} in annulus`;
        resetView();
      } catch (e) {
        lattice = { all: [], annulus: [] };
        $("latticeMeta").textContent = "Basis vectors are linearly dependent — pick two independent vectors.";
      }
    }

    updateFloorRatio();
    renderResults();
    setStatus(hasGeneratedOnce ? "Parameters changed — press Generate to re-run the enumeration." : "Ready. Press Generate to enumerate.", "");
    renderStage();
  }

  function onLatticeInputsChanged() { readInputs(); onParamsChanged(true); }
  function onAnnulusChanged() { readInputs(); onParamsChanged(true); }
  function onNChanged() { readInputs(); onParamsChanged(false); }
  function onMinorParamsChanged() { readInputs(); onParamsChanged(false); }

  // ---------------- generate ----------------

  function onGenerate() {
    readInputs();
    hasGeneratedOnce = true;
    if (!(state.minR < state.maxR) || !lattice.annulus) {
      onParamsChanged(true);
      return;
    }

    const btn = $("generateBtn");
    btn.disabled = true;
    setStatus("Computing…", "");

    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          const floorOk = updateFloorRatio();
          if (!floorOk) {
            const floor = LC.containmentFloorRatio(state.n);
            result = null;
            setStatus(
              `Skipped — maxᵣ/minᵣ = ${round(state.maxR / state.minR, 4)} is below sec(π/${state.n}) = ${round(floor, 4)}, ` +
              `so no ${state.n}-gon can contain the inner disk while keeping vertices within maxᵣ. No subsets were checked.`,
              "err"
            );
          } else {
            const res = LC.computeClasses({
              annulus: lattice.annulus,
              fullLattice: lattice.all,
              n: state.n,
              minR: state.minR,
              checkEdges: state.checkEdges,
              maxCombos: state.maxCombos,
            });
            if (res.skipped) {
              result = null;
              setStatus("Skipped — " + res.skipped, "err");
            } else {
              result = res;
              setStatus(
                `C(${lattice.annulus.length},${state.n}) = ${res.totalSubsetsChecked} subsets checked · ` +
                `${res.totalValid} raw valid polygons · ${res.classes.length} proper classes · ` +
                `${res.fullClassCount} full (congruence) classes.`,
                "ok"
              );
            }
          }
        } catch (e) {
          result = null;
          setStatus("Error: " + e.message, "err");
        }
        selectedId = null;
        renderResults();
        renderStage();
        btn.disabled = false;
      }, 10);
    });
  }

  // ---------------- results list ----------------

  function cardHtml(c) {
    const mirrorIdx = c.mirrorPartnerProperKey ? result.properKeyToIndex.get(c.mirrorPartnerProperKey) : null;
    const chirLabel = c.chiral ? "chiral" : "achiral";
    const symTag = c.rotationalSymmetry > 1 ? `<span class="sym-tag">${c.rotationalSymmetry}-fold</span>` : "";
    let mirrorHtml = "";
    if (mirrorIdx != null) {
      mirrorHtml = `<button type="button" class="mirror-link" data-mirror-index="${mirrorIdx}">→ view mirror partner (#${mirrorIdx})</button>`;
    } else if (c.chiral) {
      mirrorHtml = `<p class="no-mirror">chiral · no mirror partner realized in this set</p>`;
    }
    return `<article class="result-card${c.id === selectedId ? " selected" : ""}" data-id="${c.id}">
      <div class="result-thumb">${miniShapeSvg(c.vertices)}</div>
      <div class="result-meta">
        <div class="result-title"><strong>n=${c.vertices.length} · #${c.id}</strong><span class="tag-row"><span class="chir-tag${c.chiral ? " chiral" : ""}">${chirLabel}</span>${symTag}</span></div>
        <div class="result-stats">
          <span>area <b>${round(c.area, 4)}</b></span>
          <span>orbit <b>${c.orbitSize}</b></span>
          <span>convex <b>${round(c.convexMeasure, 3)}</b></span>
          <span>isConvex <b>${c.isConvex ? "yes" : "no"}</b></span>
          <span>I <b>${c.interiorCount}</b></span>
          <span>B <b>${c.boundaryCount}</b></span>
        </div>
        <div class="card-actions">
          ${mirrorHtml}
          <button type="button" class="copy-descriptor-btn" data-copy-id="${c.id}">Copy descriptor</button>
        </div>
      </div>
    </article>`;
  }

  function buildDescriptor(c) {
    const mirrorIdx = c.mirrorPartnerProperKey ? result.properKeyToIndex.get(c.mirrorPartnerProperKey) : null;
    return {
      format: "hrifa-annulus-polygon",
      version: 1,
      lattice: { v1: state.v1, v2: state.v2 },
      annulus: { minR: state.minR, maxR: state.maxR },
      n: state.n,
      edgePurity: state.checkEdges,
      id: c.id,
      vertices: c.vertices.map(([x, y]) => [round(x, 6), round(y, 6)]),
      signature: {
        // canonical (edge length, turning angle) sequence -- the
        // translation/rotation/reflection-invariant identity of the
        // shape itself, independent of where this instance landed
        proper: JSON.parse(c.properKey),
        full: JSON.parse(c.fullKey),
        chiral: c.chiral,
        rotationalSymmetry: c.rotationalSymmetry,
      },
      mirrorPartnerId: mirrorIdx,
      stats: {
        area: round(c.area, 6),
        convexMeasure: c.convexMeasure,
        isConvex: c.isConvex,
        interiorCount: c.interiorCount,
        boundaryCount: c.boundaryCount,
        orbitSize: c.orbitSize,
      },
    };
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch {}
    document.body.removeChild(ta);
    done();
  }

  function copyDescriptor(id, btn) {
    const cls = result && result.classes[id];
    if (!cls) return;
    const text = JSON.stringify(buildDescriptor(cls), null, 2);
    const original = btn.textContent;
    const done = () => {
      btn.textContent = "Copied";
      setTimeout(() => { btn.textContent = original; }, 900);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function miniShapeSvg(vertices) {
    const xs = vertices.map((v) => v[0]), ys = vertices.map((v) => v[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = Math.max(maxX - minX, 1e-6), h = Math.max(maxY - minY, 1e-6);
    const vw = 64, vh = 48, pad = 7;
    const scale = Math.min((vw - 2 * pad) / w, (vh - 2 * pad) / h);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const pts = vertices
      .map(([x, y]) => `${(vw / 2 + (x - cx) * scale).toFixed(2)},${(vh / 2 - (y - cy) * scale).toFixed(2)}`)
      .join(" ");
    return `<svg viewBox="0 0 ${vw} ${vh}" width="60" height="48" aria-hidden="true"><polygon points="${pts}"></polygon></svg>`;
  }

  function renderResults() {
    const wrap = $("resultsList");
    if (!result) {
      wrap.innerHTML = '<p class="empty-results">No results yet — set parameters and press Generate.</p>';
      $("resultsSummary").textContent = "Generate a set to see results.";
      return;
    }
    $("resultsSummary").textContent =
      `${result.totalValid} raw valid · ${result.classes.length} proper classes · ${result.fullClassCount} full (congruence) classes.`;
    if (!result.classes.length) {
      wrap.innerHTML = '<p class="empty-results">No valid polygons found for these parameters.</p>';
      return;
    }
    wrap.innerHTML = result.classes.map(cardHtml).join("");
    wrap.querySelectorAll(".result-card").forEach((el) => {
      el.addEventListener("click", () => selectClass(parseInt(el.dataset.id, 10)));
    });
    wrap.querySelectorAll(".mirror-link").forEach((el) => {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        selectClass(parseInt(el.dataset.mirrorIndex, 10));
      });
    });
    wrap.querySelectorAll(".copy-descriptor-btn").forEach((el) => {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        copyDescriptor(parseInt(el.dataset.copyId, 10), el);
      });
    });
  }

  function selectClass(id) {
    const prev = document.querySelector(".result-card.selected");
    if (prev) prev.classList.remove("selected");
    selectedId = id;
    const el = document.querySelector(`.result-card[data-id="${id}"]`);
    if (el) { el.classList.add("selected"); el.scrollIntoView({ block: "nearest" }); }
    renderStage();
  }

  // ---------------- lattice stage (SVG) ----------------

  function resetView() {
    camera.cx = 0;
    camera.cy = 0;
    camera.halfH = Math.max(state.maxR * 1.25, 0.5);
    updateViewBox();
  }

  function updateViewBox() {
    const rect = svg.getBoundingClientRect();
    const aspect = rect.width && rect.height ? rect.width / rect.height : 1.4;
    const halfH = camera.halfH, halfW = halfH * aspect;
    svg.setAttribute("viewBox", `${camera.cx - halfW} ${camera.cy - halfH} ${halfW * 2} ${halfH * 2}`);
  }

  function drawPolygonOverlay(parts, vertices, kind, dotR) {
    const isActive = kind === "active";
    const strokeVar = isActive ? "var(--work-surface-active)" : "var(--work-surface-relation)";
    const fillVar = isActive ? "var(--stage-active-fill)" : "var(--stage-relation-fill)";
    const dash = isActive ? "" : 'stroke-dasharray="6 4"';
    const pts = vertices.map(([x, y]) => `${x},${-y}`).join(" ");
    parts.push(
      `<polygon points="${pts}" fill="${fillVar}" stroke="${strokeVar}" stroke-width="${isActive ? 2.4 : 1.8}" vector-effect="non-scaling-stroke" ${dash}></polygon>`
    );
    const rV = dotR * (isActive ? 1.5 : 1.2);
    vertices.forEach(([x, y], i) => {
      parts.push(
        `<circle cx="${x}" cy="${-y}" r="${rV}" fill="${strokeVar}" stroke="var(--neutral-surface-bg)" stroke-width="1" vector-effect="non-scaling-stroke"></circle>`
      );
      if (isActive) {
        const fontSize = Math.max(camera.halfH * 0.045, 0.13);
        parts.push(
          `<text x="${x + rV * 1.8}" y="${-y - rV * 1.8}" font-size="${fontSize}" fill="${strokeVar}" font-family="'DM Mono', monospace">${i + 1}</text>`
        );
      }
    });
  }

  function renderStage() {
    updateViewBox();
    const parts = [];

    if (state.maxR > 0) {
      parts.push(
        `<circle cx="0" cy="0" r="${state.maxR}" fill="none" stroke="var(--line)" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"></circle>`
      );
    }
    if (state.minR > 0) {
      parts.push(
        `<circle cx="0" cy="0" r="${state.minR}" fill="var(--disk-fill)" stroke="var(--disk-line)" stroke-width="1.4" vector-effect="non-scaling-stroke"></circle>`
      );
    }

    const originSize = camera.halfH * 0.012;
    parts.push(
      `<path d="M ${-originSize} 0 L ${originSize} 0 M 0 ${-originSize} L 0 ${originSize}" stroke="var(--muted)" stroke-width="1" vector-effect="non-scaling-stroke"></path>`
    );

    const annulusKeys = new Set(lattice.annulus.map((p) => p[0] + "," + p[1]));
    const dotR = Math.max(camera.halfH * 0.014, 0.025);
    for (const p of lattice.all) {
      const inAnnulus = annulusKeys.has(p[0] + "," + p[1]);
      parts.push(
        `<circle class="${inAnnulus ? "pt-idle" : "pt-muted"}" cx="${p[0]}" cy="${-p[1]}" r="${inAnnulus ? dotR * 1.2 : dotR * 0.75}"></circle>`
      );
    }

    if (result && selectedId != null) {
      const cls = result.classes[selectedId];
      if (cls) {
        if (cls.mirrorPartnerProperKey) {
          const mirrorIdx = result.properKeyToIndex.get(cls.mirrorPartnerProperKey);
          const mirrorCls = result.classes[mirrorIdx];
          if (mirrorCls) drawPolygonOverlay(parts, mirrorCls.vertices, "relation", dotR);
        }
        drawPolygonOverlay(parts, cls.vertices, "active", dotR);
      }
    }

    svg.innerHTML = parts.join("");
  }

  // ---------------- pan / zoom ----------------

  function initPanZoom() {
    let panning = false;
    svg.addEventListener("pointerdown", (e) => {
      panning = true;
      panStart = { x: e.clientX, y: e.clientY, cx: camera.cx, cy: camera.cy };
      svg.setPointerCapture(e.pointerId);
      svg.classList.add("panning");
    });
    svg.addEventListener("pointermove", (e) => {
      if (!panning || !panStart) return;
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const aspect = rect.width / rect.height;
      const halfH = camera.halfH, halfW = halfH * aspect;
      const dxWorld = ((e.clientX - panStart.x) / rect.width) * (halfW * 2);
      const dyWorld = ((e.clientY - panStart.y) / rect.height) * (halfH * 2);
      camera.cx = panStart.cx - dxWorld;
      camera.cy = panStart.cy - dyWorld;
      updateViewBox();
    });
    function stopPan() { panning = false; panStart = null; svg.classList.remove("panning"); }
    svg.addEventListener("pointerup", stopPan);
    svg.addEventListener("pointercancel", stopPan);

    svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const aspect = rect.width / rect.height;
        const halfH = camera.halfH, halfW = halfH * aspect;
        const mx = camera.cx - halfW + ((e.clientX - rect.left) / rect.width) * (halfW * 2);
        const my = camera.cy - halfH + ((e.clientY - rect.top) / rect.height) * (halfH * 2);
        const factor = Math.exp(e.deltaY * 0.0015);
        const newHalfH = Math.min(Math.max(camera.halfH * factor, 0.15), 80);
        const t = newHalfH / camera.halfH;
        camera.cx = mx - (mx - camera.cx) * t;
        camera.cy = my - (my - camera.cy) * t;
        camera.halfH = newHalfH;
        updateViewBox();
      },
      { passive: false }
    );

    $("zoomResetBtn").addEventListener("click", () => { resetView(); });
    window.addEventListener("resize", () => updateViewBox());
  }

  // ---------------- boot ----------------

  function init() {
    restoreTheme();
    $("themeBtn").addEventListener("click", () => setTheme(document.documentElement.dataset.theme !== "dark"));

    document.querySelectorAll(".preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const preset = PRESETS[btn.dataset.preset];
        $("v1x").value = preset.v1[0]; $("v1y").value = preset.v1[1];
        $("v2x").value = preset.v2[0]; $("v2y").value = preset.v2[1];
        onLatticeInputsChanged();
      });
    });

    ["v1x", "v1y", "v2x", "v2y"].forEach((id) => $(id).addEventListener("input", onLatticeInputsChanged));

    $("minRInput").addEventListener("input", () => {
      $("minROut").textContent = parseFloat($("minRInput").value).toFixed(2);
      onAnnulusChanged();
    });
    $("maxRInput").addEventListener("input", () => {
      $("maxROut").textContent = parseFloat($("maxRInput").value).toFixed(2);
      onAnnulusChanged();
    });
    $("nInput").addEventListener("input", () => {
      $("nOut").textContent = $("nInput").value;
      onNChanged();
    });
    $("edgePurityInput").addEventListener("change", onMinorParamsChanged);
    $("maxCombosInput").addEventListener("input", () => {
      $("maxCombosOut").textContent = Number($("maxCombosInput").value).toLocaleString();
      onMinorParamsChanged();
    });
    $("generateBtn").addEventListener("click", onGenerate);

    initPanZoom();
    readInputs();
    onParamsChanged(true);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
