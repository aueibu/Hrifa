/* ================= color math (validated 1:1 against colorjs.io) ================= */
function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function linearToSrgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
function hexToRgb(hex) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
}
function rgbToHex([r,g,b]) {
  const c = v => Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,"0");
  return "#" + c(r) + c(g) + c(b);
}
function linearRgbToOklab(r,g,b) {
  const l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b;
  const m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b;
  const s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_,
    1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_,
    0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_,
  ];
}
function oklabToLinearRgb(L,a,b) {
  const l_ = L + 0.3963377774*a + 0.2158037573*b;
  const m_ = L - 0.1055613458*a - 0.0638541728*b;
  const s_ = L - 0.0894841775*a - 1.2914855480*b;
  const l = l_**3, m = m_**3, s = s_**3;
  return [
    4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
    -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
    -0.0041960863*l - 0.7034186147*m + 1.7076147010*s,
  ];
}
function hexToOklch(hex) {
  const [r,g,b] = hexToRgb(hex).map(v => srgbToLinear(v/255));
  const [L,a,bb] = linearRgbToOklab(r,g,b);
  const C = Math.sqrt(a*a+bb*bb);
  let H = Math.atan2(bb,a) * 180/Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}
function oklchToRgbLinear(L,C,H) {
  const rad = H*Math.PI/180;
  const a = C*Math.cos(rad), b = C*Math.sin(rad);
  return oklabToLinearRgb(L,a,b);
}
function inGamut(L,C,H, eps=0) {
  const [r,g,b] = oklchToRgbLinear(L,C,H);
  return r >= -eps && r <= 1+eps && g >= -eps && g <= 1+eps && b >= -eps && b <= 1+eps;
}
function oklchToHex(L,C,H) {
  const [r,g,b] = oklchToRgbLinear(L,C,H).map(v => linearToSrgb(v)*255);
  return rgbToHex([r,g,b]);
}
function maxChromaAt(L,H) {
  let lo=0, hi=0.4;
  for (let i=0;i<32;i++) {
    const mid=(lo+hi)/2;
    if (inGamut(L,mid,H)) lo=mid; else hi=mid;
  }
  return lo;
}

// APCA, literal port of colorjs.io's contrast/APCA.js incl. its this-binding arg-order quirk,
// so apcaHex(fg,bg) matches `fgColor.contrastAPCA(bgColor)` exactly.
const APCA = { normBG:0.56, normTXT:0.57, revTXT:0.62, revBG:0.65, blkThrs:0.022, blkClmp:1.414, loClip:0.1, deltaYmin:0.0005, scaleBoW:1.14, loBoWoffset:0.027, scaleWoB:1.14, loWoBoffset:0.027 };
function fclamp(Y) { return Y >= APCA.blkThrs ? Y : Y + Math.pow(APCA.blkThrs - Y, APCA.blkClmp); }
function relYApca(hex) {
  const [r,g,b] = hexToRgb(hex).map(v => v/255);
  const lin = v => { const sign = v<0?-1:1; return sign*Math.pow(Math.abs(v),2.4); };
  return lin(r)*0.2126729 + lin(g)*0.7151522 + lin(b)*0.0721750;
}
function apcaHex(fgHex, bgHex) {
  const Ytxt = fclamp(relYApca(bgHex));
  const Ybg = fclamp(relYApca(fgHex));
  if (Math.abs(Ybg - Ytxt) < APCA.deltaYmin) return 0;
  const BoW = Ybg > Ytxt;
  let C = BoW
    ? (Math.pow(Ybg, APCA.normBG) - Math.pow(Ytxt, APCA.normTXT)) * APCA.scaleBoW
    : (Math.pow(Ybg, APCA.revBG) - Math.pow(Ytxt, APCA.revTXT)) * APCA.scaleWoB;
  let Sapc;
  if (Math.abs(C) < APCA.loClip) Sapc = 0;
  else if (C > 0) Sapc = C - APCA.loBoWoffset;
  else Sapc = C + APCA.loWoBoffset;
  return Sapc * 100;
}

/* ================= derivation pipeline ================= */
const DARK_L = { "200": 0.84, "300": 0.775, "400": 0.71, "500": 0.655 };
const LIGHT_L = { "600": 0.47, "700": 0.405, "800": 0.345, "900": 0.285 };

function deriveRamp(hex, frac, cap, tintFrac, tintCap, inkFrac, inkCap) {
  const { H } = hexToOklch(hex);
  const stops = { "50": hex };
  for (const [stop, L] of Object.entries(DARK_L)) {
    const C = Math.min(maxChromaAt(L,H)*frac, cap);
    stops[stop] = oklchToHex(L,C,H);
  }
  for (const [stop, L] of Object.entries(LIGHT_L)) {
    const C = Math.min(maxChromaAt(L,H)*frac, cap);
    stops[stop] = oklchToHex(L,C,H);
  }
  const tintC = Math.min(maxChromaAt(0.95,H)*tintFrac, tintCap);
  const inkC = Math.min(maxChromaAt(0.15,H)*inkFrac, inkCap);
  stops["100"] = oklchToHex(0.95, tintC, H);
  stops["950"] = oklchToHex(0.15, inkC, H);
  return { H, stops };
}

/* ================= state ================= */
let state = {
  greys: { "50": "#f7f5f2", "100": "#e9e5e1", "900": "#1b1614", "950": "#130e0b" },
  frac: 0.78,
  cap: 0.165,
  tintFrac: 0.35,
  tintCap: 0.04,
  inkFrac: 0.35,
  inkCap: 0.03,
  view: "cards",
  colors: [
    { id: 1, hex: "#9f0e33" },
    { id: 2, hex: "#c65c00" },
    { id: 3, hex: "#449eab" },
    { id: 4, hex: "#6a9fe3" },
    { id: 5, hex: "#553d70" },
  ],
};
let nextId = 6;

/* ================= wiring: grey inputs ================= */
["50","100","900","950"].forEach(stop => {
  const picker = document.getElementById(`grey-${stop}-picker`);
  const text = document.getElementById(`grey-${stop}-text`);
  picker.value = state.greys[stop];
  text.value = state.greys[stop];
  picker.addEventListener("input", () => { state.greys[stop] = picker.value; text.value = picker.value; renderAll(); });
  text.addEventListener("change", () => {
    if (/^#[0-9a-fA-F]{6}$/.test(text.value)) { state.greys[stop] = text.value; picker.value = text.value; renderAll(); }
  });
});

const fracSlider = document.getElementById("frac-slider");
const capSlider = document.getElementById("cap-slider");
fracSlider.addEventListener("input", () => { state.frac = +fracSlider.value; document.getElementById("frac-val").textContent = state.frac.toFixed(2); renderAll(); });
capSlider.addEventListener("input", () => { state.cap = +capSlider.value; document.getElementById("cap-val").textContent = state.cap.toFixed(3); renderAll(); });

function wireSlider(sliderId, valId, stateKey, decimals) {
  const slider = document.getElementById(sliderId);
  slider.addEventListener("input", () => {
    state[stateKey] = +slider.value;
    document.getElementById(valId).textContent = state[stateKey].toFixed(decimals);
    renderAll();
  });
}
wireSlider("tint-frac-slider", "tint-frac-val", "tintFrac", 2);
wireSlider("tint-cap-slider", "tint-cap-val", "tintCap", 3);
wireSlider("ink-frac-slider", "ink-frac-val", "inkFrac", 2);
wireSlider("ink-cap-slider", "ink-cap-val", "inkCap", 3);

document.getElementById("add-color-btn").addEventListener("click", () => {
  if (state.colors.length >= 16) return;
  state.colors.push({ id: nextId++, hex: "#808080" });
  renderColorList();
  renderAll();
});

/* ================= render: color list (left panel, drag-to-reorder) ================= */
let draggedColorId = null;

function renderColorList() {
  const wrap = document.getElementById("color-list");
  wrap.innerHTML = "";
  state.colors.forEach(c => {
    const row = document.createElement("div");
    row.className = "color-row";
    row.draggable = true;
    row.innerHTML = `
      <span class="handle">&#8942;&#8942;</span>
      <input type="color" value="${c.hex}">
      <input type="text" value="${c.hex}">
      <button title="remove">&times;</button>`;
    const [handle, picker, text, removeBtn] = row.children;

    picker.addEventListener("input", () => { c.hex = picker.value; text.value = picker.value; renderAll(); });
    text.addEventListener("change", () => {
      if (/^#[0-9a-fA-F]{6}$/.test(text.value)) { c.hex = text.value; picker.value = text.value; renderAll(); }
    });
    removeBtn.addEventListener("click", () => {
      state.colors = state.colors.filter(x => x.id !== c.id);
      renderColorList();
      renderAll();
    });

    row.addEventListener("dragstart", e => {
      draggedColorId = c.id;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      draggedColorId = null;
      [...wrap.children].forEach(r => r.classList.remove("drag-over"));
    });
    row.addEventListener("dragover", e => {
      e.preventDefault();
      if (draggedColorId !== null && draggedColorId !== c.id) row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", e => {
      e.preventDefault();
      row.classList.remove("drag-over");
      if (draggedColorId === null || draggedColorId === c.id) return;
      const fromIdx = state.colors.findIndex(x => x.id === draggedColorId);
      const toIdx = state.colors.findIndex(x => x.id === c.id);
      const [moved] = state.colors.splice(fromIdx, 1);
      state.colors.splice(toIdx, 0, moved);
      renderColorList();
      renderAll();
    });

    wrap.appendChild(row);
  });
  document.getElementById("color-count").textContent = state.colors.length;
  document.getElementById("add-color-btn").disabled = state.colors.length >= 16;
}

/* ================= render: results ================= */
const DARK_STOPS = ["200","300","400","500"];
const LIGHT_STOPS = ["600","700","800","900"];
const ALL_STOPS = ["50","100","200","300","400","500","600","700","800","900","950"];

function textColorFor(stop) {
  return ["50","100","200","300","400","500"].includes(stop) ? "#1b1614" : "#f7f5f2";
}

function renderAll() {
  const results = document.getElementById("results");
  results.innerHTML = "";

  if (state.colors.length === 0) {
    results.innerHTML = `<div class="empty-state">No colors yet — add one on the left to see its derived ramp.</div>`;
    renderWheel([]);
    return;
  }

  const g = state.greys;
  const hueSummary = [];
  const computed = state.colors.map((c, idx) => {
    const { H, stops } = deriveRamp(c.hex, state.frac, state.cap, state.tintFrac, state.tintCap, state.inkFrac, state.inkCap);
    const oklch50 = hexToOklch(c.hex);
    hueSummary.push({ id: c.id, name: `color ${idx+1}`, hex: c.hex, H });
    return { c, idx, H, stops, oklch50 };
  });

  if (state.view === "grid") {
    results.appendChild(buildGridView(computed, g));
  } else {
    computed.forEach(entry => results.appendChild(buildCard(entry, g)));
  }

  renderWheel(hueSummary);
}

function buildCard({ c, idx, H, stops, oklch50 }, g) {
    const card = document.createElement("details");
    card.className = "hue-card";
    if (idx === 0) card.open = true;

    const summary = document.createElement("summary");
    summary.innerHTML = `<span class="swatch-dot" style="background:${c.hex}"></span>color ${idx+1} <span class="meta">${c.hex} · OKLCH H ${H.toFixed(1)} L ${oklch50.L.toFixed(2)} C ${oklch50.C.toFixed(3)}</span>`;
    card.appendChild(summary);

    const body = document.createElement("div");
    body.className = "hue-card-body";

    // ramp strip
    const strip = document.createElement("div");
    strip.className = "ramp-strip";
    ALL_STOPS.forEach(stop => {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.style.background = stops[stop];
      cell.innerHTML = `<span class="st" style="color:${textColorFor(stop)}">${stop}</span>`;
      strip.appendChild(cell);
    });
    body.appendChild(strip);

    // stat table
    const table = document.createElement("table");
    table.className = "stat-table";
    let thead = "<thead><tr><th>stop</th><th>hex</th><th>L</th><th>C</th><th>H</th><th>APCA</th></tr></thead>";
    let rows = "";
    ALL_STOPS.forEach(stop => {
      const hex = stops[stop];
      const o = hexToOklch(hex);
      let apcaLabel = "—";
      if (DARK_STOPS.includes(stop)) {
        apcaLabel = `${apcaHex(hex, g["950"]).toFixed(0)} / ${apcaHex(hex, g["900"]).toFixed(0)} <span style="opacity:.5">(950/900)</span>`;
      } else if (LIGHT_STOPS.includes(stop)) {
        apcaLabel = `${apcaHex(hex, g["100"]).toFixed(0)} / ${apcaHex(hex, g["50"]).toFixed(0)} <span style="opacity:.5">(100/50)</span>`;
      }
      rows += `<tr><td><code>${stop}</code></td><td><code style="color:${hex}">■</code> <code>${hex}</code></td><td><code>${o.L.toFixed(2)}</code></td><td><code>${o.C.toFixed(3)}</code></td><td><code>${o.H.toFixed(0)}</code></td><td>${apcaLabel}</td></tr>`;
    });
    table.innerHTML = thead + "<tbody>" + rows + "</tbody>";
    body.appendChild(table);

    // text specimens
    const specRow = document.createElement("div");
    specRow.className = "specimen-row";
    specRow.innerHTML = `
      <div class="specimen" style="background:${g["900"]}">
        <span class="word" style="color:${stops["300"]}">Sample text</span>
        <span class="label" style="color:${g["50"]}">stop 300 on gray.900</span>
      </div>
      <div class="specimen" style="background:${g["50"]}">
        <span class="word" style="color:${stops["700"]}">Sample text</span>
        <span class="label" style="color:${g["950"]}">stop 700 on gray.50</span>
      </div>`;
    body.appendChild(specRow);

    // UI element preview
    const uiRow = document.createElement("div");
    uiRow.className = "ui-preview-row";
    uiRow.innerHTML = `
      <div class="ui-preview" style="background:${g["900"]}">
        <span class="shape" style="font-size:26px;color:${stops["300"]}">&#9679;</span>
        <span class="shape" style="font-size:22px;color:${stops["400"]}">&#9711;</span>
        <span class="shape" style="font-size:20px;color:${stops["500"]}">&#9670;</span>
        <span class="plabel" style="color:${g["50"]}">on gray.900</span>
      </div>
      <div class="ui-preview" style="background:${g["50"]}">
        <span class="shape" style="font-size:26px;color:${stops["700"]}">&#9679;</span>
        <span class="shape" style="font-size:22px;color:${stops["800"]}">&#9711;</span>
        <span class="shape" style="font-size:20px;color:${stops["900"]}">&#9670;</span>
        <span class="plabel" style="color:${g["950"]}">on gray.50</span>
      </div>`;
    body.appendChild(uiRow);

    card.appendChild(body);
    return card;
}

function buildGridView(computed, g) {
  const wrap = document.createElement("div");
  wrap.className = "grid-wrap";
  const table = document.createElement("table");
  table.className = "full-grid";
  table.innerHTML = "<tr><th class='grid-rowhead'>color</th>" + ALL_STOPS.map(s => `<th>${s}</th>`).join("") + "</tr>";

  computed.forEach(({ c, idx, H, stops, oklch50 }) => {
    const tr = document.createElement("tr");
    let html = `<th class="grid-rowhead"><div class="grid-rowlabel"><span class="chip" style="background:${c.hex}"></span>color ${idx+1}<span class="meta">H ${H.toFixed(0)}</span></div></th>`;
    ALL_STOPS.forEach(stop => {
      const hex = stops[stop];
      html += `<td><div class="grid-swatch" style="background:${hex}"><span style="color:${textColorFor(stop)}">${hex}</span></div></td>`;
    });
    tr.innerHTML = html;
    table.appendChild(tr);
  });

  wrap.appendChild(table);
  return wrap;
}

document.getElementById("view-toggle").addEventListener("click", e => {
  const btn = e.target.closest(".view-btn");
  if (!btn) return;
  state.view = btn.dataset.view;
  [...document.querySelectorAll(".view-btn")].forEach(b => b.classList.toggle("active", b === btn));
  renderAll();
});

const SVGNS = "http://www.w3.org/2000/svg";
let wheelDrag = null; // { id, cx, cy, svgEl }

function renderWheel(entries) {
  const container = document.getElementById("wheel-container");
  const warnings = document.getElementById("gap-warnings");
  warnings.innerHTML = "";
  if (entries.length < 2) {
    container.innerHTML = entries.length === 1
      ? `<div class="wheel-hint">add a second color to see spacing</div>`
      : "";
    return;
  }

  const sorted = [...entries].sort((a,b) => a.H - b.H);
  const size = 340, cx = size/2, cy = size/2, r = 125;

  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);

  const ring = document.createElementNS(SVGNS, "circle");
  ring.setAttribute("cx", cx); ring.setAttribute("cy", cy); ring.setAttribute("r", r);
  ring.setAttribute("fill", "none"); ring.setAttribute("stroke", "var(--border)"); ring.setAttribute("stroke-width", "1");
  svg.appendChild(ring);

  sorted.forEach(e => {
    const rad = (e.H - 90) * Math.PI/180;
    const x = cx + r*Math.cos(rad), y = cy + r*Math.sin(rad);

    const line = document.createElementNS(SVGNS, "line");
    line.setAttribute("x1", cx); line.setAttribute("y1", cy);
    line.setAttribute("x2", x); line.setAttribute("y2", y);
    line.setAttribute("stroke", "var(--border)"); line.setAttribute("stroke-width", "1"); line.setAttribute("opacity", "0.4");
    svg.appendChild(line);

    const dot = document.createElementNS(SVGNS, "circle");
    dot.setAttribute("cx", x); dot.setAttribute("cy", y); dot.setAttribute("r", "11");
    dot.setAttribute("fill", e.hex); dot.setAttribute("stroke", "var(--bg)"); dot.setAttribute("stroke-width", "2");
    dot.style.cursor = "grab";
    dot.addEventListener("pointerdown", ev => {
      ev.preventDefault();
      const rect = svg.getBoundingClientRect();
      const scale = size / rect.width;
      wheelDrag = { id: e.id, cx: rect.left + (cx/size)*rect.width, cy: rect.top + (cy/size)*rect.height, scale };
      dot.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    });
    svg.appendChild(dot);
  });

  container.innerHTML = "";
  container.appendChild(svg);

  const gaps = sorted.map((e,i) => {
    const next = sorted[(i+1) % sorted.length];
    let gap = next.H - e.H;
    if (gap < 0) gap += 360;
    return { from: e.name, to: next.name, gap };
  });
  const tight = gaps.filter(g => g.gap < 25);
  if (tight.length) {
    warnings.innerHTML = tight.map(g => `<div class="gap-warning">${g.from} → ${g.to}: only ${g.gap.toFixed(1)}° apart — may be hard to tell apart at low chroma</div>`).join("");
  }
}

document.addEventListener("pointermove", ev => {
  if (!wheelDrag) return;
  const dx = ev.clientX - wheelDrag.cx;
  const dy = ev.clientY - wheelDrag.cy;
  let angle = Math.atan2(dy, dx) * 180/Math.PI + 90;
  if (angle < 0) angle += 360;
  const color = state.colors.find(c => c.id === wheelDrag.id);
  if (!color) return;
  const { L, C } = hexToOklch(color.hex);
  color.hex = oklchToHex(L, C, angle);
  renderColorListValuesOnly();
  renderAll();
});
document.addEventListener("pointerup", () => { wheelDrag = null; document.body.style.userSelect = ""; });

// keep the left-panel color list in sync (hex text/picker) without a full DOM rebuild during wheel drag
function renderColorListValuesOnly() {
  const wrap = document.getElementById("color-list");
  [...wrap.children].forEach((row, i) => {
    const color = state.colors[i];
    if (!color) return;
    const picker = row.querySelector('input[type="color"]');
    const text = row.querySelector('input[type="text"]');
    if (picker) picker.value = color.hex;
    if (text) text.value = color.hex;
  });
}

/* ================= init ================= */
renderColorList();
renderAll();
