(() => {
  "use strict";

  // ---------- Color parsing / conversion ----------

  const parseCanvas = document.createElement("canvas");
  parseCanvas.width = 1;
  parseCanvas.height = 1;
  const parseCtx = parseCanvas.getContext("2d", { willReadFrequently: true });

  // Uses the browser's own CSS color parser (via canvas fillStyle) so hex,
  // rgb()/rgba(), hsl()/hsla(), and named colors ("royalblue") all work
  // without hand-rolling a parser or a named-color table.
  function parseColor(input) {
    if (typeof input !== "string" || !input.trim()) return null;
    const sentinel = "#010203";
    parseCtx.fillStyle = sentinel;
    parseCtx.fillStyle = input.trim();
    const resolved = parseCtx.fillStyle;
    if (resolved === sentinel && input.trim().toLowerCase() !== sentinel) {
      return null;
    }
    parseCtx.clearRect(0, 0, 1, 1);
    parseCtx.fillStyle = resolved;
    parseCtx.fillRect(0, 0, 1, 1);
    const [r, g, b] = parseCtx.getImageData(0, 0, 1, 1).data;
    return { r, g, b };
  }

  function toHex(rgb) {
    const h = (n) => n.toString(16).padStart(2, "0");
    return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`.toLowerCase();
  }

  // Mixes the source color toward the chosen modifier. `amount` is the modifier's
  // contribution: 0 leaves the source unchanged; 1 yields the modifier.
  function mixRgb(source, modifier, amount) {
    const t = Math.max(0, Math.min(1, amount));
    return {
      r: clamp255(source.r * (1 - t) + modifier.r * t),
      g: clamp255(source.g * (1 - t) + modifier.g * t),
      b: clamp255(source.b * (1 - t) + modifier.b * t),
    };
  }

  function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hslToRgb(h, s, l) {
    const hue = ((h % 360) + 360) % 360 / 360;
    const sat = Math.max(0, Math.min(100, s)) / 100;
    const light = Math.max(0, Math.min(100, l)) / 100;
    if (sat === 0) {
      const gray = clamp255(light * 255);
      return { r: gray, g: gray, b: gray };
    }
    const hueToRgb = (p, q, t) => {
      let value = t;
      if (value < 0) value += 1;
      if (value > 1) value -= 1;
      if (value < 1 / 6) return p + (q - p) * 6 * value;
      if (value < 1 / 2) return q;
      if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
      return p;
    };
    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
    const p = 2 * light - q;
    return {
      r: clamp255(hueToRgb(p, q, hue + 1 / 3) * 255),
      g: clamp255(hueToRgb(p, q, hue) * 255),
      b: clamp255(hueToRgb(p, q, hue - 1 / 3) * 255),
    };
  }

  function rgbToOklab({ r, g, b }) {
    const linear = (channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    };
    const R = linear(r), G = linear(g), B = linear(b);
    const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
    const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
    const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
    const lRoot = Math.cbrt(l), mRoot = Math.cbrt(m), sRoot = Math.cbrt(s);
    return {
      l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
      a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
      b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
    };
  }

  // ---------- WCAG contrast math ----------

  function relativeLuminance({ r, g, b }) {
    const lin = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const R = lin(r), G = lin(g), B = lin(b);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  }

  function contrastRatio(rgbA, rgbB) {
    const l1 = relativeLuminance(rgbA);
    const l2 = relativeLuminance(rgbB);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  const WCAG_THRESHOLDS = {
    aaNormal: 4.5,
    aaaNormal: 7,
    aaLarge: 3,
    aaaLarge: 4.5,
  };

  function evaluate(ratio) {
    return {
      ratio,
      aaNormal: ratio >= WCAG_THRESHOLDS.aaNormal,
      aaaNormal: ratio >= WCAG_THRESHOLDS.aaaNormal,
      aaLarge: ratio >= WCAG_THRESHOLDS.aaLarge,
      aaaLarge: ratio >= WCAG_THRESHOLDS.aaaLarge,
    };
  }

  // Best WCAG level an evaluated ratio actually clears, as a compact label/badge class.
  function bestLevel(evalResult) {
    if (evalResult.aaaNormal) return { label: "AAA", cls: "pass" };
    if (evalResult.aaNormal) return { label: "AA", cls: "pass" };
    if (evalResult.aaLarge) return { label: "AA Large", cls: "warn" };
    return { label: "Fail", cls: "fail" };
  }

  // ---------- Color vision deficiency simulation ----------

  // Approximation matrices (widely reused across web colorblindness simulators,
  // e.g. the HCIRN Colorblind Web Page Filter / Coblis) applied directly to sRGB
  // values. They're not colorimetrically exact — a proper simulation needs
  // linearized RGB and cone-response modeling — but they're a good, cheap visual
  // approximation for "does this still read as distinct".
  const CVD_MATRICES = {
    protanopia: [
      [0.567, 0.433, 0],
      [0.558, 0.442, 0],
      [0, 0.242, 0.758],
    ],
    deuteranopia: [
      [0.625, 0.375, 0],
      [0.7, 0.3, 0],
      [0, 0.3, 0.7],
    ],
    tritanopia: [
      [0.95, 0.05, 0],
      [0, 0.433, 0.567],
      [0, 0.475, 0.525],
    ],
  };

  const VISION_LABELS = {
    none: "Normal vision",
    protanopia: "Protanopia",
    deuteranopia: "Deuteranopia",
    tritanopia: "Tritanopia",
    achromatopsia: "Achromatopsia",
  };

  function clamp255(v) {
    return Math.max(0, Math.min(255, Math.round(v)));
  }

  function simulateVision(rgb, mode) {
    if (mode === "none" || !mode) return rgb;
    if (mode === "achromatopsia") {
      // ITU-R BT.601 luma — a standard perceived-brightness approximation for
      // rendering a color as the grayscale someone with total color blindness sees.
      const gray = clamp255(0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b);
      return { r: gray, g: gray, b: gray };
    }
    const m = CVD_MATRICES[mode];
    if (!m) return rgb;
    return {
      r: clamp255(m[0][0] * rgb.r + m[0][1] * rgb.g + m[0][2] * rgb.b),
      g: clamp255(m[1][0] * rgb.r + m[1][1] * rgb.g + m[1][2] * rgb.b),
      b: clamp255(m[2][0] * rgb.r + m[2][1] * rgb.g + m[2][2] * rgb.b),
    };
  }

  // ---------- Named color matching (meodai/color-names "best of" list) ----------

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  const colorNameEntries = (typeof COLOR_NAMES !== "undefined" ? COLOR_NAMES : [])
    .map((c) => ({ name: c.name, rgb: hexToRgb(c.hex) }))
    .filter((c) => c.rgb);

  const colorNameByLowerName = new Map(colorNameEntries.map((c) => [c.name.toLowerCase(), c]));

  // Squared Euclidean distance in RGB space is enough to find a good match without
  // the cost of a perceptual color-difference formula, and it's fast over ~5k entries.
  function findNearestColorName(rgb) {
    let best = null;
    let bestDist = Infinity;
    for (const c of colorNameEntries) {
      const dr = c.rgb.r - rgb.r, dg = c.rgb.g - rgb.g, db = c.rgb.b - rgb.b;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    return best ? best.name : "";
  }

  // ---------- State ----------

  const STORAGE_KEY = "colorChecker.palette";

  /** @type {{id: number, rgb: {r:number,g:number,b:number}, hex: string}[]} */
  const palette = [];
  let nextId = 1;
  let currentRgb = { r: 51, g: 102, b: 255 };

  function savePalette() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(palette.map((c) => c.hex)));
    } catch (e) {
      // storage unavailable (private browsing, quota, etc.) — silently skip persistence
    }
  }

  function loadPalette() {
    let hexes;
    try {
      hexes = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (e) {
      hexes = [];
    }
    if (!Array.isArray(hexes)) return;
    hexes.forEach((hex) => {
      const rgb = parseColor(hex);
      if (rgb && !palette.some((c) => c.hex === toHex(rgb))) {
        palette.push({ id: nextId++, rgb, hex: toHex(rgb) });
      }
    });
  }

  // Persists a single on/off toggle (e.g. "swap rows/columns") across reloads.
  function createBoolSetting(key) {
    return {
      save(value) {
        try {
          localStorage.setItem(key, value ? "1" : "0");
        } catch (e) {
          // storage unavailable — silently skip persistence
        }
      },
      load() {
        try {
          return localStorage.getItem(key) === "1";
        } catch (e) {
          return false;
        }
      },
    };
  }

  const swapAxesSetting = createBoolSetting("colorChecker.swapAxes");
  const largeTextSetting = createBoolSetting("colorChecker.largeText");

  // Persists a single string choice (e.g. "vision simulation mode") across reloads.
  function createStringSetting(key, defaultValue) {
    return {
      save(value) {
        try {
          localStorage.setItem(key, value);
        } catch (e) {
          // storage unavailable — silently skip persistence
        }
      },
      load() {
        try {
          return localStorage.getItem(key) || defaultValue;
        } catch (e) {
          return defaultValue;
        }
      },
    };
  }

  const visionModeSetting = createStringSetting("colorChecker.visionMode", "none");
  const cellSizeSetting = createStringSetting("colorChecker.cellSize", "176");
  const previewTextSetting = createStringSetting("colorChecker.previewText", "Worm Aglet");
  const accentPreviewTextSetting = createStringSetting("colorChecker.accentPreviewText", "■▧◉●Worm Aglet");
  const accentVariantsSetting = createStringSetting("colorChecker.accentVariants", "soft,input,dark");
  const samplePageLightSurfaceSetting = createStringSetting("colorChecker.samplePageLightSurface", "");
  const samplePageLightPanelSetting = createStringSetting("colorChecker.samplePageLightPanel", "");
  const samplePageLightTextSetting = createStringSetting("colorChecker.samplePageLightText", "");
  const samplePageDarkSurfaceSetting = createStringSetting("colorChecker.samplePageDarkSurface", "");
  const samplePageDarkPanelSetting = createStringSetting("colorChecker.samplePageDarkPanel", "");
  const samplePageDarkTextSetting = createStringSetting("colorChecker.samplePageDarkText", "");
  const samplePageLightPrimarySetting = createStringSetting("colorChecker.samplePageLightPrimary", "input");
  const samplePageLightSecondarySetting = createStringSetting("colorChecker.samplePageLightSecondary", "dark");
  const samplePageDarkPrimarySetting = createStringSetting("colorChecker.samplePageDarkPrimary", "soft");
  const samplePageDarkSecondarySetting = createStringSetting("colorChecker.samplePageDarkSecondary", "input");
  const softenMixColorSetting = createStringSetting("colorChecker.softenMixColor", "#e5dcd7");
  const darkenMixColorSetting = createStringSetting("colorChecker.darkenMixColor", "#1a1a1a");
  const softenMixPercentSetting = createStringSetting("colorChecker.softenMixPercent", "30");
  const darkenMixPercentSetting = createStringSetting("colorChecker.darkenMixPercent", "28");
  const warmMixColorSetting = createStringSetting("colorChecker.warmMixColor", "#ff8a3d");
  const coolMixColorSetting = createStringSetting("colorChecker.coolMixColor", "#559dff");
  const warmMixPercentSetting = createStringSetting("colorChecker.warmMixPercent", "22");
  const coolMixPercentSetting = createStringSetting("colorChecker.coolMixPercent", "22");
  const globalHueSetting = createStringSetting("colorChecker.globalHue", "0");
  const globalSatSetting = createStringSetting("colorChecker.globalSat", "0");
  const globalLightSetting = createStringSetting("colorChecker.globalLight", "0");

  const PRESETS_STORAGE_KEY = "colorChecker.presets";
  const PANEL_FOLDS_STORAGE_KEY = "colorChecker.panelFolds";
  const ACCENT_BACKGROUNDS_STORAGE_KEY = "colorChecker.accentBackgrounds";
  const ACCENT_COMPARISONS_STORAGE_KEY = "colorChecker.accentComparisonColors";
  const SAMPLE_PAGE_ACCENTS_STORAGE_KEY = "colorChecker.samplePageAccents";
  const EXPORT_FAMILIES_STORAGE_KEY = "colorChecker.exportFamilies";

  /** @type {{id: number, name: string, hexes: string[]}[]} */
  const presets = [];
  let nextPresetId = 1;
  let activePresetName = "";
  const accentBackgroundHexes = new Set();
  const accentComparisonHexes = new Set();
  let accentComparisonsConfigured = false;
  const samplePageAccentHexes = new Set();
  let samplePageAccentsConfigured = false;
  const exportFamilies = new Map();

  function loadExportFamilies() {
    try {
      const stored = JSON.parse(localStorage.getItem(EXPORT_FAMILIES_STORAGE_KEY) || "{}");
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) return;
      Object.entries(stored).forEach(([id, assignment]) => {
        if (typeof assignment === "string" && ["light-surface", "light-ink", "dark-surface", "dark-ink", "accent-warm", "accent-cool", "other"].includes(assignment)) {
          exportFamilies.set(Number(id), assignment);
        } else if (assignment && ["light", "dark"].includes(assignment.theme) && ["surface", "ink", "accent-warm", "accent-cool"].includes(assignment.role)) {
          exportFamilies.set(Number(id), assignment.role.startsWith("accent-") ? assignment.role : `${assignment.theme}-${assignment.role}`);
        }
      });
    } catch (e) {
      // storage unavailable or malformed — keep default family assignments
    }
  }

  function saveExportFamilies() {
    try {
      localStorage.setItem(EXPORT_FAMILIES_STORAGE_KEY, JSON.stringify(Object.fromEntries(exportFamilies)));
    } catch (e) {
      // storage unavailable — silently skip persistence
    }
  }

  function exportFamilyFor(color) {
    return exportFamilies.get(color.id) || "accent-warm";
  }

  function savePresets() {
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets.map((p) => ({ name: p.name, hexes: p.hexes }))));
    } catch (e) {
      // storage unavailable — silently skip persistence
    }
  }

  function loadPresets() {
    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY) || "[]");
    } catch (e) {
      stored = [];
    }
    if (!Array.isArray(stored)) return;
    stored.forEach((p) => {
      if (p && typeof p.name === "string" && Array.isArray(p.hexes)) {
        presets.push({ id: nextPresetId++, name: p.name, hexes: p.hexes.filter((h) => parseColor(h)) });
      }
    });
  }

  function saveAccentBackgrounds() {
    try {
      localStorage.setItem(ACCENT_BACKGROUNDS_STORAGE_KEY, JSON.stringify([...accentBackgroundHexes]));
    } catch (e) {
      // storage unavailable â€” silently skip persistence
    }
  }

  function loadAccentBackgrounds() {
    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(ACCENT_BACKGROUNDS_STORAGE_KEY) || "[]");
    } catch (e) {
      stored = [];
    }
    if (!Array.isArray(stored)) return;
    stored.forEach((value) => {
      if (typeof value === "number") accentBackgroundHexes.add(value);
      else if (typeof value === "string") {
        const color = palette.find((entry) => entry.hex === value);
        if (color) accentBackgroundHexes.add(color.id);
      }
    });
  }

  function saveAccentComparisons() {
    try {
      localStorage.setItem(ACCENT_COMPARISONS_STORAGE_KEY, JSON.stringify([...accentComparisonHexes]));
      accentComparisonsConfigured = true;
    } catch (e) {
      // storage unavailable â€” silently skip persistence
    }
  }

  function loadAccentComparisons() {
    let stored;
    try {
      const raw = localStorage.getItem(ACCENT_COMPARISONS_STORAGE_KEY);
      if (raw === null) return;
      stored = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!Array.isArray(stored)) return;
    stored.forEach((value) => {
      if (typeof value === "number") accentComparisonHexes.add(value);
      else if (typeof value === "string") {
        const color = palette.find((entry) => entry.hex === value);
        if (color) accentComparisonHexes.add(color.id);
      }
    });
    accentComparisonsConfigured = true;
  }

  function saveSamplePageAccents() {
    try {
      localStorage.setItem(SAMPLE_PAGE_ACCENTS_STORAGE_KEY, JSON.stringify([...samplePageAccentHexes]));
      samplePageAccentsConfigured = true;
    } catch (e) {
      // storage unavailable â€” silently skip persistence
    }
  }

  function loadSamplePageAccents() {
    let stored;
    try {
      const raw = localStorage.getItem(SAMPLE_PAGE_ACCENTS_STORAGE_KEY);
      if (raw === null) return;
      stored = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!Array.isArray(stored)) return;
    stored.forEach((value) => {
      if (typeof value === "number") samplePageAccentHexes.add(value);
      else if (typeof value === "string") {
        const color = palette.find((entry) => entry.hex === value);
        if (color) samplePageAccentHexes.add(color.id);
      }
    });
    samplePageAccentsConfigured = true;
  }

  function loadPanelFolds() {
    try {
      const stored = JSON.parse(localStorage.getItem(PANEL_FOLDS_STORAGE_KEY) || "{}");
      return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    } catch (e) {
      return {};
    }
  }

  function savePanelFolds(folds) {
    try {
      localStorage.setItem(PANEL_FOLDS_STORAGE_KEY, JSON.stringify(folds));
    } catch (e) {
      // storage unavailable â€” silently skip persistence
    }
  }

  // ---------- Elements ----------

  const addColorBtn = document.getElementById("addColorBtn");
  const colorError = document.getElementById("colorError");

  const paletteList = document.getElementById("paletteList");
  const paletteCount = document.getElementById("paletteCount");
  const paletteEmpty = document.getElementById("paletteEmpty");
  const clearPaletteBtn = document.getElementById("clearPaletteBtn");
  const exportPaletteBtn = document.getElementById("exportPaletteBtn");
  const exportDerivedBtn = document.getElementById("exportDerivedBtn");
  const exportGroupedBtn = document.getElementById("exportGroupedBtn");
  const exportFamilyPanel = document.getElementById("exportFamilyPanel");
  const exportFamilyList = document.getElementById("exportFamilyList");
  const downloadGroupedBtn = document.getElementById("downloadGroupedBtn");
  const importPaletteBtn = document.getElementById("importPaletteBtn");

  const importBackdrop = document.getElementById("importBackdrop");
  const importPopover = document.getElementById("importPopover");
  const importCloseBtn = document.getElementById("importCloseBtn");
  const importCancelBtn = document.getElementById("importCancelBtn");
  const importSubmitBtn = document.getElementById("importSubmitBtn");
  const importTextarea = document.getElementById("importTextarea");
  const importFileInput = document.getElementById("importFileInput");
  const importError = document.getElementById("importError");

  const presetNameInput = document.getElementById("presetNameInput");
  const savePresetBtn = document.getElementById("savePresetBtn");
  const presetError = document.getElementById("presetError");
  const presetList = document.getElementById("presetList");
  const presetEmpty = document.getElementById("presetEmpty");

  const gridSection = document.getElementById("gridSection");
  const punnettGrid = document.getElementById("punnettGrid");
  const largeTextToggle = document.getElementById("largeTextToggle");
  const previewTextInput = document.getElementById("previewTextInput");
  const swapAxesToggle = document.getElementById("swapAxesToggle");
  const gridAxesHint = document.getElementById("gridAxesHint");
  const visionSelect = document.getElementById("visionSelect");
  const visionInfoBtn = document.getElementById("visionInfoBtn");
  const visionInfoTooltip = document.getElementById("visionInfoTooltip");
  const cellSizeSlider = document.getElementById("cellSizeSlider");
  const cellSizeValue = document.getElementById("cellSizeValue");

  const rankingsSection = document.getElementById("rankingsSection");
  const rankingsHead = document.getElementById("rankingsHead");
  const rankingsBody = document.getElementById("rankingsBody");

  const accentContrastSection = document.getElementById("accentContrastSection");
  const accentBackgroundSelector = document.getElementById("accentBackgroundSelector");
  const accentComparisonSelector = document.getElementById("accentComparisonSelector");
  const accentVariantSelector = document.getElementById("accentVariantSelector");
  const accentContrastEmpty = document.getElementById("accentContrastEmpty");
  const accentContrastGrid = document.getElementById("accentContrastGrid");
  const accentPreviewTextInput = document.getElementById("accentPreviewTextInput");
  const samplePageSection = document.getElementById("samplePageSection");
  const samplePageLightSurface = document.getElementById("samplePageLightSurface");
  const samplePageLightPanel = document.getElementById("samplePageLightPanel");
  const samplePageLightText = document.getElementById("samplePageLightText");
  const samplePageDarkSurface = document.getElementById("samplePageDarkSurface");
  const samplePageDarkPanel = document.getElementById("samplePageDarkPanel");
  const samplePageDarkText = document.getElementById("samplePageDarkText");
  const samplePageLightPrimary = document.getElementById("samplePageLightPrimary");
  const samplePageLightSecondary = document.getElementById("samplePageLightSecondary");
  const samplePageDarkPrimary = document.getElementById("samplePageDarkPrimary");
  const samplePageDarkSecondary = document.getElementById("samplePageDarkSecondary");
  const samplePageAccentSelector = document.getElementById("samplePageAccentSelector");
  const openSamplePageBtn = document.getElementById("openSamplePageBtn");
  const samplePageStatus = document.getElementById("samplePageStatus");
  const samplePageError = document.getElementById("samplePageError");
  const sampleRatiosSection = document.getElementById("sampleRatiosSection");
  const sampleRatiosGrid = document.getElementById("sampleRatiosGrid");

  const colorFieldSection = document.getElementById("colorFieldSection");
  const colorFieldCanvas = document.getElementById("colorFieldCanvas");
  const colorFieldLegend = document.getElementById("colorFieldLegend");
  const oklabViewSection = document.getElementById("oklabViewSection");
  const oklabViewCanvas = document.getElementById("oklabViewCanvas");
  const oklabViewLegend = document.getElementById("oklabViewLegend");

  const customRainbowSection = document.getElementById("customRainbowSection");
  const customRainbow = document.getElementById("customRainbow");
  const softenMixColor = document.getElementById("softenMixColor");
  const softenMixPercent = document.getElementById("softenMixPercent");
  const softenMixValue = document.getElementById("softenMixValue");
  const darkenMixColor = document.getElementById("darkenMixColor");
  const darkenMixPercent = document.getElementById("darkenMixPercent");
  const darkenMixValue = document.getElementById("darkenMixValue");
  const temperatureRainbowSection = document.getElementById("temperatureRainbowSection");
  const temperatureRainbow = document.getElementById("temperatureRainbow");
  const warmMixColor = document.getElementById("warmMixColor");
  const warmMixPercent = document.getElementById("warmMixPercent");
  const warmMixValue = document.getElementById("warmMixValue");
  const coolMixColor = document.getElementById("coolMixColor");
  const coolMixPercent = document.getElementById("coolMixPercent");
  const coolMixValue = document.getElementById("coolMixValue");
  const softenMixReset = document.getElementById("softenMixReset");
  const darkenMixReset = document.getElementById("darkenMixReset");
  const warmMixReset = document.getElementById("warmMixReset");
  const coolMixReset = document.getElementById("coolMixReset");
  const globalHueSlider = document.getElementById("globalHueSlider");
  const globalSatSlider = document.getElementById("globalSatSlider");
  const globalLightSlider = document.getElementById("globalLightSlider");
  const globalHueValue = document.getElementById("globalHueValue");
  const globalSatValue = document.getElementById("globalSatValue");
  const globalLightValue = document.getElementById("globalLightValue");
  const globalAdjustReset = document.getElementById("globalAdjustReset");

  // The adjustment is deliberately a view/export modifier: palette entries retain
  // their imported or entered values, so Reset always returns to the true palette.
  function adjustedRgb(rgb) {
    const hueShift = Number(globalHueSlider.value);
    const saturationShift = Number(globalSatSlider.value);
    const lightnessShift = Number(globalLightSlider.value);
    if (!hueShift && !saturationShift && !lightnessShift) return rgb;
    const hsl = rgbToHsl(rgb);
    return hslToRgb(hsl.h + hueShift, hsl.s + saturationShift, hsl.l + lightnessShift);
  }

  function withAdjustedPalette(callback) {
    const originals = palette.map((color) => ({ color, rgb: color.rgb, hex: color.hex }));
    originals.forEach(({ color }) => {
      color.rgb = adjustedRgb(color.rgb);
      color.hex = toHex(color.rgb);
    });
    try {
      return callback();
    } finally {
      originals.forEach(({ color, rgb, hex }) => {
        color.rgb = rgb;
        color.hex = hex;
      });
    }
  }

  function updateGlobalAdjustUi() {
    globalHueValue.textContent = `${Number(globalHueSlider.value)}°`;
    globalSatValue.textContent = `${Number(globalSatSlider.value)}`;
    globalLightValue.textContent = `${Number(globalLightSlider.value)}`;
  }

  function renderAdjustedPalette() {
    updateGlobalAdjustUi();
    withAdjustedPalette(() => {
      renderPalette(); renderCustomRainbow(); renderTemperatureRainbow(); renderGrid();
      renderAccentContrast(); renderSamplePagePanel(); renderSampleRatios(); renderRankings();
      renderColorField(); renderOklabView();
    });
  }

  globalHueSlider.value = globalHueSetting.load();
  globalSatSlider.value = globalSatSetting.load();
  globalLightSlider.value = globalLightSetting.load();
  [
    [globalHueSlider, globalHueSetting], [globalSatSlider, globalSatSetting], [globalLightSlider, globalLightSetting],
  ].forEach(([slider, setting]) => slider.addEventListener("input", () => {
    setting.save(slider.value);
    renderAdjustedPalette();
  }));
  globalAdjustReset.addEventListener("click", () => {
    globalHueSlider.value = globalSatSlider.value = globalLightSlider.value = "0";
    globalHueSetting.save("0"); globalSatSetting.save("0"); globalLightSetting.save("0");
    renderAdjustedPalette();
  });

  // ---------- Reusable picker/slider/text editor ----------

  // Wires up a color picker + text input + H/S/L sliders (each with a numeric
  // readout/input twin) + a color-name field (+ optional swatch/error elements)
  // so they all stay in sync around one RGB value. Used for both the main
  // "add a color" panel and the compact edit popover.
  function createColorEditor({ picker, text, hue, sat, light, hueNumber, satNumber, lightNumber, swatch, error, name, onChange }) {
    let rgb = { r: 0, g: 0, b: 0 };

    function updateSliderTracks() {
      const h = Number(hue.value);
      const s = Number(sat.value);
      const l = Number(light.value);
      hue.style.background = `linear-gradient(to right, hsl(0 ${s}% ${l}%), hsl(60 ${s}% ${l}%), hsl(120 ${s}% ${l}%), hsl(180 ${s}% ${l}%), hsl(240 ${s}% ${l}%), hsl(300 ${s}% ${l}%), hsl(360 ${s}% ${l}%))`;
      sat.style.background = `linear-gradient(to right, hsl(${h} 0% ${l}%), hsl(${h} 100% ${l}%))`;
      light.style.background = `linear-gradient(to right, #000, hsl(${h} ${s}% 50%), #fff)`;
    }

    function setRgb(newRgb, source) {
      rgb = newRgb;
      if (swatch) swatch.style.background = toHex(rgb);
      if (error) error.textContent = "";

      if (source !== "picker") picker.value = toHex(rgb);
      if (source !== "text") text.value = toHex(rgb);
      if (source !== "sliders") {
        const hsl = rgbToHsl(rgb);
        hue.value = hsl.h;
        sat.value = hsl.s;
        light.value = hsl.l;
        if (hueNumber) hueNumber.value = hsl.h;
        if (satNumber) satNumber.value = hsl.s;
        if (lightNumber) lightNumber.value = hsl.l;
      }
      updateSliderTracks();
      if (name && source !== "name") {
        name.value = findNearestColorName(rgb);
      }
      if (onChange) onChange({ ...rgb }, source);
    }

    picker.addEventListener("input", () => {
      const parsed = parseColor(picker.value);
      if (parsed) setRgb(parsed, "picker");
    });

    function commitText() {
      const parsed = parseColor(text.value);
      if (parsed) {
        setRgb(parsed, "text");
      } else if (text.value.trim() && error) {
        error.textContent = `"${text.value.trim()}" isn't a recognized color.`;
      }
    }
    text.addEventListener("change", commitText);
    text.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitText();
      }
    });

    function onSliderInput() {
      if (hueNumber) hueNumber.value = hue.value;
      if (satNumber) satNumber.value = sat.value;
      if (lightNumber) lightNumber.value = light.value;
      const parsed = parseColor(`hsl(${Number(hue.value)} ${Number(sat.value)}% ${Number(light.value)}%)`);
      if (parsed) setRgb(parsed, "sliders");
      else updateSliderTracks();
    }
    hue.addEventListener("input", onSliderInput);
    sat.addEventListener("input", onSliderInput);
    light.addEventListener("input", onSliderInput);

    // Lets the numeric field drive the slider it sits next to: clamp to the
    // slider's own min/max, push the value into the range input, then run the
    // normal slider-change path so color + the other two fields stay in sync.
    function bindNumberTwin(numberEl, rangeEl) {
      if (!numberEl) return;
      numberEl.addEventListener("input", () => {
        if (numberEl.value === "") return;
        const min = Number(rangeEl.min);
        const max = Number(rangeEl.max);
        const v = Number(numberEl.value);
        if (Number.isNaN(v)) return;
        rangeEl.value = Math.min(max, Math.max(min, v));
        onSliderInput();
      });
    }
    bindNumberTwin(hueNumber, hue);
    bindNumberTwin(satNumber, sat);
    bindNumberTwin(lightNumber, light);

    if (name) {
      function commitName() {
        const match = colorNameByLowerName.get(name.value.trim().toLowerCase());
        if (match) {
          setRgb(match.rgb, "name");
        } else if (name.value.trim() && error) {
          error.textContent = `"${name.value.trim()}" isn't a recognized color name.`;
        }
      }
      name.addEventListener("change", commitName);
      name.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitName();
        }
      });
    }

    return {
      getRgb: () => rgb,
      setRgb,
    };
  }

  const mainEditor = createColorEditor({
    picker: document.getElementById("colorPicker"),
    text: document.getElementById("colorText"),
    hue: document.getElementById("hueSlider"),
    sat: document.getElementById("satSlider"),
    light: document.getElementById("lightSlider"),
    hueNumber: document.getElementById("hueNumber"),
    satNumber: document.getElementById("satNumber"),
    lightNumber: document.getElementById("lightNumber"),
    error: document.getElementById("colorError"),
    name: document.getElementById("colorName"),
  });
  mainEditor.setRgb(currentRgb, "init");

  // ---------- Palette management ----------

  function addCurrentColor() {
    const rgb = mainEditor.getRgb();
    const hex = toHex(rgb);
    if (palette.some((c) => c.hex === hex)) {
      colorError.textContent = `${hex} is already in the palette.`;
      return;
    }
    palette.push({ id: nextId++, rgb: { ...rgb }, hex });
    colorError.textContent = "";
    renderAll();
  }
  addColorBtn.addEventListener("click", addCurrentColor);

  function removeColor(id) {
    const idx = palette.findIndex((c) => c.id === id);
    if (idx !== -1) {
      palette.splice(idx, 1);
      exportFamilies.delete(id);
      saveExportFamilies();
      renderAll();
    }
  }

  clearPaletteBtn.addEventListener("click", () => {
    if (!window.confirm("Clear every color from the palette? Saved presets will be kept.")) return;
    palette.length = 0;
    exportFamilies.clear();
    saveExportFamilies();
    activePresetName = "";
    renderAll();
  });

  // ---------- Import / export ----------
  // File format: plain text, one color per line (hex, rgb()/hsl(), or a CSS
  // name) — about the simplest human-readable, human-editable format there is.

  function exportFilename(kind) {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    const preset = activePresetName.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");
    return `${timestamp}${preset ? `-${preset}` : ""}-${kind}.txt`;
  }

  function exportPalette() {
    if (!palette.length) return;
    const text = [
      "# Color Checker palette",
      `# Soften: ${softenMixColor.value} ${softenMixPercent.value}%`,
      `# Darken: ${darkenMixColor.value} ${darkenMixPercent.value}%`,
      `# Warm: ${warmMixColor.value} ${warmMixPercent.value}%`,
      `# Cool: ${coolMixColor.value} ${coolMixPercent.value}%`,
      "# Colors",
      ...palette.map((c) => c.hex),
      "",
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename("palette");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  exportPaletteBtn.addEventListener("click", () => withAdjustedPalette(exportPalette));

  function exportDerivedPalette() {
    if (!palette.length) return;
    const baseVariants = paletteVariants();
    const warmWith = parseColor(warmMixColor.value) || { r: 255, g: 138, b: 61 };
    const coolWith = parseColor(coolMixColor.value) || { r: 85, g: 157, b: 255 };
    const families = [
      { label: "Input", colors: baseVariants[1].colors },
      { label: "Soft", colors: baseVariants[0].colors },
      { label: "Dark", colors: baseVariants[2].colors },
      { label: "Warm", colors: palette.map((color) => mixRgb(color.rgb, warmWith, Number(warmMixPercent.value) / 100)) },
      { label: "Cool", colors: palette.map((color) => mixRgb(color.rgb, coolWith, Number(coolMixPercent.value) / 100)) },
    ];
    const text = families.map((family) => `# ${family.label}\n${family.colors.map(toHex).join("\n")}`).join("\n\n") + "\n";
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename("derived");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  exportDerivedBtn.addEventListener("click", () => withAdjustedPalette(exportDerivedPalette));

  function renderExportFamilies() {
    exportFamilyList.innerHTML = palette.map((color) => {
      const name = findNearestColorName(color.rgb) || "Unnamed color";
      return `<label class="export-family-row">
        <span class="export-family-color"><span style="background:${color.hex}"></span><code>${name} · ${color.hex}</code></span>
        <select data-export-family-id="${color.id}" aria-label="Export family for ${color.hex}">
          <option value="light-surface">Light - Surface</option>
          <option value="light-ink">Light - Ink</option>
          <option value="dark-surface">Dark - Surface</option>
          <option value="dark-ink">Dark - Ink</option>
          <option value="accent-warm">Accent - Warm</option>
          <option value="accent-cool">Accent - Cool</option>
          <option value="other">Other</option>
        </select>
        <select data-export-role-id="${color.id}" aria-label="Role for ${color.hex}">
          <option value="surface">Surface</option>
          <option value="ink">Ink</option>
          <option value="accent-warm">Accent — Warm</option>
          <option value="accent-cool">Accent — Cool</option>
        </select>
      </label>`;
    }).join("");
    exportFamilyList.querySelectorAll("[data-export-role-id]").forEach((select) => select.remove());
    exportFamilyList.querySelectorAll("[data-export-family-id]").forEach((familySelect) => {
      const color = palette.find((entry) => entry.id === Number(familySelect.dataset.exportFamilyId));
      if (!color) return;
      familySelect.value = exportFamilyFor(color);
      familySelect.addEventListener("change", () => {
        exportFamilies.set(color.id, familySelect.value);
        saveExportFamilies();
      });
    });
  }

  function exportGroupedDerivedPalette() {
    if (!palette.length) return;
    const variants = paletteVariants();
    const variantIndex = { soft: 0, input: 1, dark: 2 };
    const warmWith = parseColor(warmMixColor.value) || { r: 255, g: 138, b: 61 };
    const coolWith = parseColor(coolMixColor.value) || { r: 85, g: 157, b: 255 };
    const sampleVariants = {
      light: [samplePageLightPrimarySetting.load(), samplePageLightSecondarySetting.load()],
      dark: [samplePageDarkPrimarySetting.load(), samplePageDarkSecondarySetting.load()],
    };
    const resolvedVariant = (color, index, variant) => {
      if (variant in variantIndex) return variants[variantIndex[variant]].colors[index];
      if (variant === "warm") return mixRgb(color.rgb, warmWith, Number(warmMixPercent.value) / 100);
      return mixRgb(color.rgb, coolWith, Number(coolMixPercent.value) / 100);
    };
    const text = [
      "# Color Checker grouped theme palette",
      "# Accent Primary and Secondary use the current Sample Page selection for that theme.",
      "",
      "# Mix Values",
      `Soften: ${softenMixColor.value} at ${softenMixPercent.value}%`,
      `Darken: ${darkenMixColor.value} at ${darkenMixPercent.value}%`,
      `Warm: ${warmMixColor.value} at ${warmMixPercent.value}%`,
      `Cool: ${coolMixColor.value} at ${coolMixPercent.value}%`,
      ""
    ];
    text.push("# Input Colors");
    palette.forEach((color) => text.push(`${findNearestColorName(color.rgb) || "Unnamed color"}: ${color.hex}`));
    text.push("");
    text.push("# Other");
    const otherColors = palette.filter((color) => exportFamilyFor(color) === "other");
    if (!otherColors.length) text.push("(none)");
    otherColors.forEach((color) => {
      const index = palette.indexOf(color);
      text.push(`${findNearestColorName(color.rgb) || "Unnamed color"} - Input: ${color.hex}`);
      [["Soft", "soft"], ["Dark", "dark"], ["Warm", "warm"], ["Cool", "cool"]].forEach(([label, variant]) => {
        const rgb = resolvedVariant(color, index, variant);
        text.push(`${findNearestColorName(rgb) || "Unnamed color"} - ${label}: ${toHex(rgb)}`);
      });
    });
    text.push("");
    [["Light Theme Colors", "light"], ["Dark Theme Colors", "dark"]].forEach(([themeLabel, theme]) => {
      text.push(`# ${themeLabel}`);
      [["Surface", `${theme}-surface`], ["Ink", `${theme}-ink`]].forEach(([roleLabel, family]) => {
        text.push(`## ${roleLabel}`);
        const colors = palette.filter((color) => exportFamilyFor(color) === family);
        if (!colors.length) text.push("(none)");
        colors.forEach((color) => text.push(`${findNearestColorName(color.rgb) || "Unnamed color"}: ${color.hex}`));
        text.push("");
      });
      text.push("## Accent");
      [["Warm", "accent-warm"], ["Cool", "accent-cool"]].forEach(([temperatureLabel, family]) => {
        text.push(`### ${temperatureLabel}`);
        const colors = palette.filter((color) => exportFamilyFor(color) === family);
        if (!colors.length) text.push("(none)");
        colors.forEach((color) => {
          const index = palette.indexOf(color);
          const [primaryVariant, secondaryVariant] = sampleVariants[theme];
          const primaryRgb = resolvedVariant(color, index, primaryVariant);
          const secondaryRgb = resolvedVariant(color, index, secondaryVariant);
          text.push(`${findNearestColorName(color.rgb) || "Unnamed color"} - Input: ${color.hex}`);
          text.push(`${findNearestColorName(primaryRgb) || "Unnamed color"} - Primary (${primaryVariant}): ${toHex(primaryRgb)}`);
          text.push(`${findNearestColorName(secondaryRgb) || "Unnamed color"} - Secondary (${secondaryVariant}): ${toHex(secondaryRgb)}`);
        });
        text.push("");
      });
      text.push("");
    });
    const blob = new Blob([`${text.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename("grouped-derived");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  exportGroupedBtn.addEventListener("click", () => {
    exportFamilyPanel.hidden = !exportFamilyPanel.hidden;
    if (!exportFamilyPanel.hidden) renderExportFamilies();
  });
  downloadGroupedBtn.addEventListener("click", () => withAdjustedPalette(exportGroupedDerivedPalette));

  function openImportPopover() {
    importTextarea.value = "";
    importError.textContent = "";
    importFileInput.value = "";
    importBackdrop.hidden = false;
    importPopover.hidden = false;
    importTextarea.focus();
  }

  function closeImportPopover() {
    importBackdrop.hidden = true;
    importPopover.hidden = true;
  }
  importPaletteBtn.addEventListener("click", openImportPopover);
  importCloseBtn.addEventListener("click", closeImportPopover);
  importCancelBtn.addEventListener("click", closeImportPopover);
  importBackdrop.addEventListener("click", closeImportPopover);

  importFileInput.addEventListener("change", () => {
    const file = importFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      importTextarea.value = String(reader.result);
    };
    reader.readAsText(file);
  });

  function importPaletteText() {
    const rawLines = importTextarea.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const recipeInputs = {
      soften: [softenMixColor, softenMixPercent, softenMixValue, softenMixColorSetting, softenMixPercentSetting],
      darken: [darkenMixColor, darkenMixPercent, darkenMixValue, darkenMixColorSetting, darkenMixPercentSetting],
      warm: [warmMixColor, warmMixPercent, warmMixValue, warmMixColorSetting, warmMixPercentSetting],
      cool: [coolMixColor, coolMixPercent, coolMixValue, coolMixColorSetting, coolMixPercentSetting],
    };
    rawLines.forEach((line) => {
      const match = line.match(/^#\s*(soften|darken|warm|cool)\s*:\s*(#[0-9a-f]{6})\s+(\d{1,3})%?\s*$/i);
      if (!match) return;
      const [, name, hex, percent] = match;
      const [colorInput, percentInput, percentOutput, colorSetting, percentSetting] = recipeInputs[name.toLowerCase()];
      colorInput.value = hex;
      percentInput.value = String(Math.min(100, Number(percent)));
      percentOutput.value = `${percentInput.value}%`;
      percentOutput.textContent = `${percentInput.value}%`;
      colorSetting.save(colorInput.value);
      percentSetting.save(percentInput.value);
    });
    const lines = rawLines.filter((line) => !line.startsWith("#"));
    if (!lines.length) {
      importError.textContent = "Paste or choose a file with at least one color.";
      return;
    }

    let added = 0;
    let duplicates = 0;
    const invalidLines = [];
    lines.forEach((line) => {
      const rgb = parseColor(line);
      if (!rgb) {
        invalidLines.push(line);
        return;
      }
      const hex = toHex(rgb);
      if (palette.some((c) => c.hex === hex)) {
        duplicates++;
        return;
      }
      palette.push({ id: nextId++, rgb, hex });
      added++;
    });

    if (added) renderAll();

    const parts = [];
    if (added) parts.push(`Added ${added} color${added === 1 ? "" : "s"}.`);
    if (duplicates) parts.push(`${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped.`);
    if (invalidLines.length) parts.push(`${invalidLines.length} line${invalidLines.length === 1 ? "" : "s"} not recognized.`);

    if (invalidLines.length) {
      importError.textContent = parts.join(" ") + " Fix or remove the lines below and import again.";
      importTextarea.value = invalidLines.join("\n");
    } else {
      importError.textContent = "";
      closeImportPopover();
    }
    renderAll();
  }
  importSubmitBtn.addEventListener("click", importPaletteText);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !importPopover.hidden) closeImportPopover();
  });

  // ---------- Presets ----------

  function saveCurrentAsPreset() {
    const name = presetNameInput.value.trim();
    if (!palette.length) {
      presetError.textContent = "Add at least one color before saving a preset.";
      return;
    }
    if (!name) {
      presetError.textContent = "Give the preset a name.";
      return;
    }
    if (presets.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      presetError.textContent = `A preset named "${name}" already exists.`;
      return;
    }
    presets.push({ id: nextPresetId++, name, hexes: palette.map((c) => c.hex) });
    activePresetName = name;
    presetNameInput.value = "";
    presetError.textContent = "";
    renderAll();
  }
  savePresetBtn.addEventListener("click", saveCurrentAsPreset);
  presetNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveCurrentAsPreset();
    }
  });

  function loadPreset(id) {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    palette.length = 0;
    preset.hexes.forEach((hex) => {
      const rgb = parseColor(hex);
      if (rgb && !palette.some((c) => c.hex === toHex(rgb))) {
        palette.push({ id: nextId++, rgb, hex: toHex(rgb) });
      }
    });
    activePresetName = preset.name;
    renderAll();
  }

  function deletePreset(id) {
    const idx = presets.findIndex((p) => p.id === id);
    if (idx !== -1) {
      if (!window.confirm(`Delete the preset “${presets[idx].name}”? This cannot be undone.`)) return;
      presets.splice(idx, 1);
      renderAll();
    }
  }

  // ---------- Edit popover ----------

  const editBackdrop = document.getElementById("editBackdrop");
  const editPopover = document.getElementById("editPopover");
  const editPopoverTitle = document.getElementById("editPopoverTitle");
  const editColorError = document.getElementById("editColorError");
  const editCancelBtn = document.getElementById("editCancelBtn");
  const editCloseBtn = document.getElementById("editCloseBtn");
  const editDeleteBtn = document.getElementById("editDeleteBtn");

  let editingId = null;
  let editingRecipe = null;

  const editEditor = createColorEditor({
    picker: document.getElementById("editColorPicker"),
    text: document.getElementById("editColorText"),
    hue: document.getElementById("editHueSlider"),
    sat: document.getElementById("editSatSlider"),
    light: document.getElementById("editLightSlider"),
    hueNumber: document.getElementById("editHueNumber"),
    satNumber: document.getElementById("editSatNumber"),
    lightNumber: document.getElementById("editLightNumber"),
    error: editColorError,
    name: document.getElementById("editColorName"),
    onChange(rgb) {
      if (editingRecipe) {
        editingRecipe.input.value = toHex(rgb);
        editingRecipe.setting.save(editingRecipe.input.value);
        renderAll();
        return;
      }
      if (editingId == null) return;
      const entry = palette.find((c) => c.id === editingId);
      if (!entry) return;
      entry.rgb = rgb;
      entry.hex = toHex(rgb);
      renderAll();
    },
  });

  function openEditPopover(color, event) {
    const editButton = event.target.closest(".palette-edit, [data-palette-id]");
    if (!editButton) return;
    const anchor = editButton.getBoundingClientRect();
    editingId = color.id;
    editingRecipe = null;
    editPopoverTitle.textContent = "Edit color";
    editDeleteBtn.hidden = false;
    editEditor.setRgb(color.rgb, "init");
    editColorError.textContent = "";
    editPopover.hidden = false;
    const rect = editPopover.getBoundingClientRect();
    const margin = 12;
    const left = Math.max(margin, Math.min(anchor.left + anchor.width / 2 - rect.width / 2, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, anchor.top - rect.height - 4);
    editPopover.style.left = `${left}px`;
    editPopover.style.top = `${top}px`;
  }

  function openRecipePopover(input, setting, label, event) {
    const anchor = event.currentTarget.getBoundingClientRect();
    editingId = null;
    editingRecipe = { input, setting };
    editPopoverTitle.textContent = `Edit ${label} mix color`;
    editDeleteBtn.hidden = true;
    editEditor.setRgb(parseColor(input.value), "init");
    editColorError.textContent = "";
    editPopover.hidden = false;
    const rect = editPopover.getBoundingClientRect();
    const margin = 12;
    editPopover.style.left = `${Math.max(margin, Math.min(anchor.left + anchor.width / 2 - rect.width / 2, window.innerWidth - rect.width - margin))}px`;
    editPopover.style.top = `${Math.max(margin, anchor.top - rect.height - 4)}px`;
  }

  function closeEditPopover() {
    editingId = null;
    editingRecipe = null;
    editPopover.hidden = true;
  }

  editDeleteBtn.addEventListener("click", () => {
    if (editingId != null) removeColor(editingId);
    closeEditPopover();
  });

  editCancelBtn.addEventListener("click", closeEditPopover);
  editCloseBtn.addEventListener("click", closeEditPopover);
  let popoverDrag = null;
  editPopover.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button, input, label, select, textarea, a")) return;
    const rect = editPopover.getBoundingClientRect();
    popoverDrag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    editPopover.classList.add("dragging");
    editPopover.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  editPopover.addEventListener("pointermove", (event) => {
    if (!popoverDrag || event.pointerId !== popoverDrag.pointerId) return;
    const margin = 8;
    const rect = editPopover.getBoundingClientRect();
    const left = Math.max(margin, Math.min(event.clientX - popoverDrag.offsetX, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(event.clientY - popoverDrag.offsetY, window.innerHeight - rect.height - margin));
    editPopover.style.left = `${left}px`;
    editPopover.style.top = `${top}px`;
  });
  editPopover.addEventListener("pointerup", (event) => {
    if (!popoverDrag || event.pointerId !== popoverDrag.pointerId) return;
    editPopover.releasePointerCapture(event.pointerId);
    editPopover.classList.remove("dragging");
    popoverDrag = null;
  });
  document.addEventListener("pointerdown", (event) => {
    if (!editPopover.hidden && !editPopover.contains(event.target) && !event.target.closest(".palette-edit")) {
      closeEditPopover();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !editPopover.hidden) closeEditPopover();
  });

  // ---------- Rendering ----------

  function renderPalette() {
    paletteList.innerHTML = "";
    palette.forEach((c) => {
      const li = document.createElement("li");
      li.className = "palette-band";
      li.dataset.id = c.id;
      li.title = "Drag to reorder";
      li.innerHTML = `
        <button type="button" class="palette-band-hex" data-hex="${c.hex}" data-palette-id="${c.id}" aria-label="Copy ${c.hex}">${c.hex}</button>
        <button type="button" class="palette-edit" aria-label="Edit ${c.hex}">Edit</button>
      `;
      li.style.background = c.hex;
      li.querySelector(".palette-band-hex").addEventListener("pointerdown", (e) => e.stopPropagation());
      li.querySelector(".palette-edit").addEventListener("pointerdown", (e) => e.stopPropagation());
      li.querySelector(".palette-edit").addEventListener("click", (event) => openEditPopover(c, event));
      bindPaletteBandDrag(li, c.id);
      paletteList.appendChild(li);
    });

    paletteCount.textContent = palette.length ? `(${palette.length})` : "";
    paletteEmpty.hidden = palette.length > 0;
    clearPaletteBtn.hidden = palette.length === 0;
    exportPaletteBtn.hidden = palette.length === 0;
    exportDerivedBtn.hidden = palette.length === 0;
    exportGroupedBtn.hidden = palette.length === 0;
    if (exportFamilyPanel.hidden === false) renderExportFamilies();
  }

  let draggingPaletteId = null;
  let paletteDropTarget = null;
  let paletteDropAfter = false;

  function clearPaletteDropMarker() {
    if (paletteDropTarget) {
      paletteDropTarget.classList.remove("drop-before", "drop-after");
    }
    paletteDropTarget = null;
  }

  function finishPaletteDrag() {
    const draggedId = draggingPaletteId;
    const targetId = paletteDropTarget ? Number(paletteDropTarget.dataset.id) : null;
    const placeAfter = paletteDropAfter;
    clearPaletteDropMarker();
    document.querySelectorAll(".palette-band.dragging").forEach((band) => band.classList.remove("dragging"));
    paletteList.classList.remove("is-dragging");
    draggingPaletteId = null;
    if (targetId == null || targetId === draggedId) return;

    const from = palette.findIndex((c) => c.id === draggedId);
    const target = palette.findIndex((c) => c.id === targetId);
    if (from === -1 || target === -1) return;
    const [color] = palette.splice(from, 1);
    const targetAfterRemoval = palette.findIndex((c) => c.id === targetId);
    palette.splice(targetAfterRemoval + (placeAfter ? 1 : 0), 0, color);
    renderAll();
  }

  function wouldChangePaletteOrder(draggedId, targetId, placeAfter) {
    const from = palette.findIndex((c) => c.id === draggedId);
    const target = palette.findIndex((c) => c.id === targetId);
    if (from === -1 || target === -1 || from === target) return false;
    const withoutDragged = palette.filter((c) => c.id !== draggedId);
    const targetAfterRemoval = withoutDragged.findIndex((c) => c.id === targetId);
    const insertionIndex = targetAfterRemoval + (placeAfter ? 1 : 0);
    return insertionIndex !== from;
  }

  function bindPaletteBandDrag(band, id) {
    band.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) return;
      draggingPaletteId = id;
      band.classList.add("dragging");
      paletteList.classList.add("is-dragging");
      band.setPointerCapture(event.pointerId);
    });
    band.addEventListener("pointermove", (event) => {
      if (draggingPaletteId !== id) return;
      // The dragged band's own footprint is a neutral zone. Without this guard,
      // hit testing around its edges can briefly resolve to an adjacent band and
      // suggest a move even though the color has not crossed into a new slot.
      const ownRect = band.getBoundingClientRect();
      if (event.clientX >= ownRect.left && event.clientX <= ownRect.right) {
        clearPaletteDropMarker();
        return;
      }
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".palette-band");
      clearPaletteDropMarker();
      if (!target || Number(target.dataset.id) === id) return;
      const targetId = Number(target.dataset.id);
      const placeAfter = event.clientX > target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2;
      // Do not advertise the immediate-neighbor insertion points that leave the
      // order untouched (for example: color 2 before color 3 when it is already there).
      if (!wouldChangePaletteOrder(id, targetId, placeAfter)) return;
      paletteDropTarget = target;
      paletteDropAfter = placeAfter;
      target.classList.add(paletteDropAfter ? "drop-after" : "drop-before");
    });
    band.addEventListener("pointerup", finishPaletteDrag);
    band.addEventListener("pointercancel", finishPaletteDrag);
  }

  function renderPresets() {
    presetList.innerHTML = "";
    presets.forEach((p) => {
      const li = document.createElement("li");
      li.className = "preset-item";
      const swatches = p.hexes.map((hex) => `<span class="preset-swatch" style="background:${hex}"></span>`).join("");
      li.innerHTML = `
        <span class="preset-name">${p.name}</span>
        <span class="preset-swatches">${swatches}</span>
        <span class="preset-item-actions">
          <button type="button" class="preset-load-btn">Load</button>
          <button type="button" class="preset-delete-btn" aria-label="Delete preset ${p.name}">&times;</button>
        </span>
      `;
      li.querySelector(".preset-load-btn").addEventListener("click", () => loadPreset(p.id));
      li.querySelector(".preset-delete-btn").addEventListener("click", () => deletePreset(p.id));
      presetList.appendChild(li);
    });

    presetEmpty.hidden = presets.length > 0;
  }

  function renderCustomRainbow() {
    const show = palette.length > 0;
    customRainbowSection.hidden = !show;
    if (!show) {
      customRainbow.innerHTML = "";
      return;
    }

    const rows = paletteVariants();

    customRainbow.innerHTML = rows.map((row) => `
      <div class="rainbow-row">
        <div class="rainbow-row-label">${row.label}</div>
        <div class="rainbow-swatches">
          ${row.colors.map((rgb, index) => {
            const hex = toHex(rgb);
            const paletteId = row.label === "Input" ? ` data-palette-id="${palette[index].id}"` : "";
            return `<div class="rainbow-swatch" style="background:${hex}" title="${row.label}: ${hex}"><button type="button" class="rainbow-hex" data-hex="${hex}"${paletteId} aria-label="Copy ${row.label.toLowerCase()} color ${hex}">${hex}</button></div>`;
          }).join("")}
        </div>
      </div>
    `).join("");
  }

  function renderTemperatureRainbow() {
    const show = palette.length > 0;
    temperatureRainbowSection.hidden = !show;
    if (!show) {
      temperatureRainbow.innerHTML = "";
      return;
    }
    const warmWith = parseColor(warmMixColor.value) || { r: 255, g: 138, b: 61 };
    const coolWith = parseColor(coolMixColor.value) || { r: 85, g: 157, b: 255 };
    const warmAmount = Number(warmMixPercent.value) / 100;
    const coolAmount = Number(coolMixPercent.value) / 100;
    const rows = [
      { label: "Warmed", colors: palette.map((color) => mixRgb(color.rgb, warmWith, warmAmount)) },
      { label: "Input", colors: palette.map((color) => color.rgb) },
      { label: "Cooled", colors: palette.map((color) => mixRgb(color.rgb, coolWith, coolAmount)) },
    ];
    temperatureRainbow.innerHTML = rows.map((row) => `
      <div class="rainbow-row">
        <div class="rainbow-row-label">${row.label}</div>
        <div class="rainbow-swatches">
          ${row.colors.map((rgb, index) => {
            const hex = toHex(rgb);
            const paletteId = row.label === "Input" ? ` data-palette-id="${palette[index].id}"` : "";
            return `<div class="rainbow-swatch" style="background:${hex}" title="${row.label}: ${hex}"><button type="button" class="rainbow-hex" data-hex="${hex}"${paletteId} aria-label="Copy ${row.label.toLowerCase()} color ${hex}">${hex}</button></div>`;
          }).join("")}
        </div>
      </div>
    `).join("");
  }

  function paletteVariants() {
    const softenWith = parseColor(softenMixColor.value) || { r: 255, g: 255, b: 255 };
    const darkenWith = parseColor(darkenMixColor.value) || { r: 0, g: 0, b: 0 };
    const softenAmount = Number(softenMixPercent.value) / 100;
    const darkenAmount = Number(darkenMixPercent.value) / 100;
    return [
      { label: "Softened", shortLabel: "Soft", colors: palette.map((c) => mixRgb(c.rgb, softenWith, softenAmount)) },
      { label: "Input", shortLabel: "Input", colors: palette.map((c) => c.rgb) },
      { label: "Darkened", shortLabel: "Dark", colors: palette.map((c) => mixRgb(c.rgb, darkenWith, darkenAmount)) },
    ];
  }

  function levelBadgeHtml(level, extraClass) {
    return `<span class="badge ${level.cls}${extraClass ? " " + extraClass : ""}" title="${level.label}">${level.label}</span>`;
  }

  function escapeHtml(value) {
    return value.replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;",
    })[char]);
  }

  function renderGrid() {
    const show = palette.length >= 2;
    gridSection.hidden = !show;
    if (!show) {
      punnettGrid.innerHTML = "";
      return;
    }

    const large = largeTextToggle.checked;
    const swapped = swapAxesToggle.checked;
    const visionMode = visionSelect.value;
    const simulating = visionMode !== "none";
    const previewText = escapeHtml(previewTextInput.value);

    if (gridAxesHint) {
      const rowRole = swapped ? "foreground (text)" : "background";
      const colRole = swapped ? "background" : "foreground (text)";
      gridAxesHint.innerHTML = `Rows are used as the <strong>${rowRole}</strong>; columns are used as the <strong>${colRole}</strong>.`;
    }

    const headerHex = (c) => (simulating ? toHex(simulateVision(c.rgb, visionMode)) : c.hex);

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.innerHTML = `<th class="corner-label" scope="col"></th>` +
      palette.map((c) => `<th scope="col"><span class="th-swatch" style="background:${headerHex(c)}"></span><button type="button" class="grid-hex" data-hex="${c.hex}" data-palette-id="${c.id}" aria-label="Copy ${c.hex}">${c.hex}</button></th>`).join("");
    thead.appendChild(headRow);

    const tbody = document.createElement("tbody");
    palette.forEach((rowColor) => {
      const tr = document.createElement("tr");
      const rowHeader = document.createElement("th");
      rowHeader.scope = "row";
      rowHeader.innerHTML = `<span class="th-swatch" style="background:${headerHex(rowColor)}"></span><button type="button" class="grid-hex" data-hex="${rowColor.hex}" data-palette-id="${rowColor.id}" aria-label="Copy ${rowColor.hex}">${rowColor.hex}</button>`;
      tr.appendChild(rowHeader);

      palette.forEach((colColor) => {
        const td = document.createElement("td");
        const isSelf = rowColor.id === colColor.id;
        const ratio = contrastRatio(rowColor.rgb, colColor.rgb);
        const level = bestLevel(evaluate(ratio));
        const bgColor = swapped ? colColor : rowColor;
        const fgColor = swapped ? rowColor : colColor;
        const sampleBg = simulating ? toHex(simulateVision(bgColor.rgb, visionMode)) : bgColor.hex;
        const sampleFg = simulating ? toHex(simulateVision(fgColor.rgb, visionMode)) : fgColor.hex;
        const simRatio = simulating ? contrastRatio(simulateVision(rowColor.rgb, visionMode), simulateVision(colColor.rgb, visionMode)) : null;
        const ratioTitle = simulating
          ? `Contrast ratio ${ratio.toFixed(2)}:1. Simulated (${VISION_LABELS[visionMode]}): ${simRatio.toFixed(2)}:1.`
          : `Contrast ratio ${ratio.toFixed(2)}:1.`;
        const cell = document.createElement("div");
        cell.className = "cell" + (isSelf ? " self" : "");
        cell.innerHTML = `<div class="sample${large ? " large" : ""}" style="background:${sampleBg};color:${sampleFg}">
          <span class="band-text">${previewText}</span>
          ${levelBadgeHtml(level, "level-badge")}
          <div class="ratio-overlay"><span class="ratio-pill" title="${ratioTitle}">${ratio.toFixed(2)}:1</span></div>
        </div>`;
        td.appendChild(cell);
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    punnettGrid.innerHTML = "";
    punnettGrid.appendChild(thead);
    punnettGrid.appendChild(tbody);
  }

  function renderAccentContrast() {
    const show = palette.length >= 2;
    accentContrastSection.hidden = !show;
    if (!show) {
      accentBackgroundSelector.innerHTML = "";
      accentComparisonSelector.innerHTML = "";
      accentContrastGrid.innerHTML = "";
      accentContrastEmpty.textContent = "";
      return;
    }

    const availableIds = new Set(palette.map((color) => color.id));
    [...accentBackgroundHexes].forEach((id) => {
      if (!availableIds.has(id)) accentBackgroundHexes.delete(id);
    });
    saveAccentBackgrounds();
    accentBackgroundSelector.innerHTML = palette.map((color) => {
      const selected = accentBackgroundHexes.has(color.id);
      return `<button type="button" class="accent-background-choice${selected ? " selected" : ""}" data-id="${color.id}" data-palette-id="${color.id}" aria-pressed="${selected}" title="${selected ? "Remove" : "Use"} ${color.hex} as a background"><span style="background:${color.hex}"></span>${color.hex}</button>`;
    }).join("");
    accentBackgroundSelector.querySelectorAll(".accent-background-choice").forEach((button) => {
      button.addEventListener("click", () => {
        const id = Number(button.dataset.id);
        if (accentBackgroundHexes.has(id)) accentBackgroundHexes.delete(id);
        else accentBackgroundHexes.add(id);
        saveAccentBackgrounds();
        renderAdjustedPalette();
      });
    });

    const backgrounds = palette.filter((color) => accentBackgroundHexes.has(color.id));
    const availableAccents = palette.filter((color) => !accentBackgroundHexes.has(color.id));
    if (!accentComparisonsConfigured) availableAccents.forEach((color) => accentComparisonHexes.add(color.id));
    [...accentComparisonHexes].forEach((id) => {
      if (!availableAccents.some((color) => color.id === id)) accentComparisonHexes.delete(id);
    });
    accentComparisonSelector.innerHTML = availableAccents.map((color) => {
      const selected = accentComparisonHexes.has(color.id);
      return `<button type="button" class="accent-background-choice${selected ? " selected" : ""}" data-id="${color.id}" data-palette-id="${color.id}" aria-pressed="${selected}" title="${selected ? "Remove" : "Use"} ${color.hex} as an accent"><span style="background:${color.hex}"></span>${color.hex}</button>`;
    }).join("");
    accentComparisonSelector.querySelectorAll(".accent-background-choice").forEach((button) => {
      button.addEventListener("click", () => {
        const id = Number(button.dataset.id);
        if (accentComparisonHexes.has(id)) accentComparisonHexes.delete(id);
        else accentComparisonHexes.add(id);
        saveAccentComparisons();
        renderAdjustedPalette();
      });
    });
    const accents = availableAccents.filter((color) => accentComparisonHexes.has(color.id));
    accentContrastGrid.innerHTML = "";
    if (!backgrounds.length) {
      accentContrastEmpty.textContent = "Select at least one color above to use as a background.";
      return;
    }
    if (!accents.length) {
      accentContrastEmpty.textContent = "Choose at least one available palette color to test as an accent.";
      return;
    }
    accentContrastEmpty.textContent = "";

    const selectedVariantKeys = new Set(accentVariantsSetting.load().split(",").filter((key) => ["soft", "input", "dark", "warm", "cool"].includes(key)));
    if (!selectedVariantKeys.size) selectedVariantKeys.add("input");
    const variantButtons = [...accentVariantSelector.querySelectorAll("button[data-variant]")];
    const orderedButtons = [...selectedVariantKeys].map((key) => variantButtons.find((button) => button.dataset.variant === key)).filter(Boolean);
    variantButtons.filter((button) => !selectedVariantKeys.has(button.dataset.variant)).forEach((button) => orderedButtons.push(button));
    orderedButtons.forEach((button) => accentVariantSelector.appendChild(button));
    orderedButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(selectedVariantKeys.has(button.dataset.variant)));
    });

    const visionMode = visionSelect.value;
    const simulating = visionMode !== "none";
    const previewText = escapeHtml(accentPreviewTextInput.value);
    const warmWith = parseColor(warmMixColor.value) || { r: 255, g: 138, b: 61 };
    const coolWith = parseColor(coolMixColor.value) || { r: 85, g: 157, b: 255 };
    const allVariants = [
      ...paletteVariants().map((variant, index) => ({ ...variant, key: ["soft", "input", "dark"][index] })),
      { key: "warm", label: "Warmed", shortLabel: "Warm", colors: palette.map((color) => mixRgb(color.rgb, warmWith, Number(warmMixPercent.value) / 100)) },
      { key: "cool", label: "Cooled", shortLabel: "Cool", colors: palette.map((color) => mixRgb(color.rgb, coolWith, Number(coolMixPercent.value) / 100)) },
    ];
    const variants = [...selectedVariantKeys].map((key) => allVariants.find((variant) => variant.key === key)).filter(Boolean);
    const headerHex = (color) => simulating ? toHex(simulateVision(color.rgb, visionMode)) : color.hex;
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr><th scope="col">Background / accent</th>${accents.map((color) => `<th scope="col"><span class="th-swatch" style="background:${headerHex(color)}"></span><span class="input-hex" data-palette-id="${color.id}">${color.hex}</span></th>`).join("")}</tr>`;
    const tbody = document.createElement("tbody");
    backgrounds.forEach((background) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<th scope="row"><span class="th-swatch" style="background:${headerHex(background)}"></span><span class="input-hex" data-palette-id="${background.id}">${background.hex}</span></th>`;
      accents.forEach((accent) => {
        const cell = document.createElement("td");
        const accentIndex = palette.indexOf(accent);
        cell.innerHTML = `<div class="cell accent-cell"><div class="sample-stack">${variants.map((variant) => {
          const accentRgb = variant.colors[accentIndex];
          const ratio = contrastRatio(background.rgb, accentRgb);
          const level = bestLevel(evaluate(ratio));
          const sampleBg = simulating ? toHex(simulateVision(background.rgb, visionMode)) : background.hex;
          const sampleFg = simulating ? toHex(simulateVision(accentRgb, visionMode)) : toHex(accentRgb);
          const simRatio = simulating ? contrastRatio(simulateVision(background.rgb, visionMode), simulateVision(accentRgb, visionMode)) : null;
          const ratioTitle = simulating
            ? `${variant.label}: ${ratio.toFixed(2)}:1. Simulated (${VISION_LABELS[visionMode]}): ${simRatio.toFixed(2)}:1.`
            : `${variant.label}: ${ratio.toFixed(2)}:1.`;
          return `<div class="sample-band" style="background:${sampleBg};color:${sampleFg}">
            <span class="band-label">${variant.shortLabel}</span>
            ${levelBadgeHtml(level, "band-level")}
            <span class="accent-band-text"><span class="accent-text-12">${previewText}</span><span class="accent-text-18">${previewText}</span><span class="accent-text-24">${previewText}</span></span>
            <span class="ratio-pill band-ratio" title="${ratioTitle}">${ratio.toFixed(2)}:1</span>
          </div>`;
        }).join("")}</div></div>`;
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
    accentContrastGrid.appendChild(thead);
    accentContrastGrid.appendChild(tbody);
  }

  function renderSamplePagePanel() {
    const show = palette.length >= 3;
    samplePageSection.hidden = !show;
    if (!show) return;
    const colorsByLightness = [...palette].sort((a, b) => relativeLuminance(a.rgb) - relativeLuminance(b.rgb));
    const darkest = colorsByLightness[0].hex;
    const lightest = colorsByLightness.at(-1).hex;
    const ensurePaletteValue = (group, saved, fallback) => {
      const value = palette.some((color) => color.hex === saved) ? saved : fallback;
      group.dataset.value = value;
      group.innerHTML = palette.map((color) => `<button type="button" class="sample-page-role-swatch${color.hex === value ? " selected" : ""}" data-hex="${color.hex}" data-palette-id="${color.id}" title="${color.name || color.hex} · ${color.hex}" aria-pressed="${color.hex === value}"><span style="background:${color.hex}"></span><code>${color.hex}</code></button>`).join("");
    };
    ensurePaletteValue(samplePageLightSurface, samplePageLightSurfaceSetting.load(), lightest);
    ensurePaletteValue(samplePageDarkSurface, samplePageDarkSurfaceSetting.load(), darkest);
    ensurePaletteValue(samplePageLightPanel, samplePageLightPanelSetting.load(), samplePageLightSurface.dataset.value);
    ensurePaletteValue(samplePageDarkPanel, samplePageDarkPanelSetting.load(), samplePageDarkSurface.dataset.value);
    if (!palette.some((color) => color.hex === samplePageLightPanelSetting.load())) {
      samplePageLightPanelSetting.save(samplePageLightPanel.dataset.value);
    }
    if (!palette.some((color) => color.hex === samplePageDarkPanelSetting.load())) {
      samplePageDarkPanelSetting.save(samplePageDarkPanel.dataset.value);
    }
    ensurePaletteValue(samplePageLightText, samplePageLightTextSetting.load(), samplePageDarkSurface.dataset.value);
    ensurePaletteValue(samplePageDarkText, samplePageDarkTextSetting.load(), samplePageLightSurface.dataset.value);
    if (!palette.some((color) => color.hex === samplePageLightTextSetting.load())) {
      samplePageLightTextSetting.save(samplePageLightText.dataset.value);
    }
    if (!palette.some((color) => color.hex === samplePageDarkTextSetting.load())) {
      samplePageDarkTextSetting.save(samplePageDarkText.dataset.value);
    }
    const syncSampleVariant = (container, setting, fallback) => {
      const selected = ["soft", "input", "dark", "warm", "cool"].includes(setting.load()) ? setting.load() : fallback;
      container.querySelectorAll("button[data-variant]").forEach((button) => {
        button.setAttribute("aria-pressed", String(selected === button.dataset.variant));
      });
      return selected;
    };
    const lightPrimary = syncSampleVariant(samplePageLightPrimary, samplePageLightPrimarySetting, "input");
    const lightSecondary = syncSampleVariant(samplePageLightSecondary, samplePageLightSecondarySetting, "dark");
    const darkPrimary = syncSampleVariant(samplePageDarkPrimary, samplePageDarkPrimarySetting, "soft");
    const darkSecondary = syncSampleVariant(samplePageDarkSecondary, samplePageDarkSecondarySetting, "input");

    const roleHexes = new Set([samplePageLightSurface.dataset.value, samplePageLightPanel.dataset.value, samplePageLightText.dataset.value, samplePageDarkSurface.dataset.value, samplePageDarkPanel.dataset.value, samplePageDarkText.dataset.value]);
    const availableAccents = palette.filter((color) => !roleHexes.has(color.hex));
    if (!samplePageAccentsConfigured) availableAccents.forEach((color) => samplePageAccentHexes.add(color.id));
    [...samplePageAccentHexes].forEach((id) => {
      if (!availableAccents.some((color) => color.id === id)) samplePageAccentHexes.delete(id);
    });
    samplePageAccentSelector.innerHTML = availableAccents.map((color) => {
      const selected = samplePageAccentHexes.has(color.id);
      return `<button type="button" class="sample-page-accent-choice${selected ? " selected" : ""}" data-id="${color.id}" data-palette-id="${color.id}" aria-pressed="${selected}" title="${selected ? "Remove" : "Use"} ${color.name || color.hex} as an accent"><span style="background:${color.hex}"></span><code>${color.hex}</code></button>`;
    }).join("");
    const accentCount = availableAccents.filter((color) => samplePageAccentHexes.has(color.id)).length;
    const ready = samplePageLightSurface.dataset.value !== samplePageDarkSurface.dataset.value && accentCount > 0 && lightPrimary && lightSecondary && darkPrimary && darkSecondary;
    openSamplePageBtn.disabled = !ready;
    samplePageStatus.textContent = ready
      ? `${accentCount} accent${accentCount === 1 ? "" : "s"} · light uses Input + Dark · dark uses Soft + Input`
      : "Choose different light and dark surfaces and leave an accent color available.";
    samplePageError.textContent = "";
  }

  function renderSampleRatios() {
    const lightSurface = samplePageLightSurface.dataset.value;
    const darkSurface = samplePageDarkSurface.dataset.value;
    if (!lightSurface || !darkSurface) { sampleRatiosSection.hidden = true; return; }
    const roleHexes = new Set([lightSurface, samplePageLightPanel.dataset.value, samplePageLightText.dataset.value, darkSurface, samplePageDarkPanel.dataset.value, samplePageDarkText.dataset.value]);
    const accents = palette.filter((color) => !roleHexes.has(color.hex) && samplePageAccentHexes.has(color.id));
    const keys = ["soft", "input", "dark", "warm", "cool"];
    const pick = (setting, fallback) => keys.includes(setting.load()) ? setting.load() : fallback;
    const themes = [
      { name: "Light", panel: samplePageLightPanel.dataset.value, variants: [pick(samplePageLightPrimarySetting, "input"), pick(samplePageLightSecondarySetting, "dark")] },
      { name: "Dark", panel: samplePageDarkPanel.dataset.value, variants: [pick(samplePageDarkPrimarySetting, "soft"), pick(samplePageDarkSecondarySetting, "input")] },
    ];
    if (!accents.length || themes.some((theme) => !theme.panel)) { sampleRatiosSection.hidden = true; sampleRatiosGrid.innerHTML = ""; return; }
    const base = paletteVariants();
    const warmWith = parseColor(warmMixColor.value) || { r: 255, g: 138, b: 61 };
    const coolWith = parseColor(coolMixColor.value) || { r: 85, g: 157, b: 255 };
    const colorsForAccent = (accent) => {
      const index = palette.indexOf(accent);
      return { soft: toHex(base[0].colors[index]), input: accent.hex, dark: toHex(base[2].colors[index]), warm: toHex(mixRgb(accent.rgb, warmWith, Number(warmMixPercent.value) / 100)), cool: toHex(mixRgb(accent.rgb, coolWith, Number(coolMixPercent.value) / 100)) };
    };
    const statsFor = (panel, key) => {
      const values = accents.map((accent) => contrastRatio(hexToRgb(panel), hexToRgb(colorsForAccent(accent)[key])));
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
      return `${average.toFixed(2)} ± ${deviation.toFixed(2)}`;
    };
    sampleRatiosGrid.innerHTML = themes.map((theme) => {
      const stats = `<div class="sample-ratio-stats"><span>Input <b>${statsFor(theme.panel, "input")}</b></span><span>Primary <b>${statsFor(theme.panel, theme.variants[0])}</b></span><span>Secondary <b>${statsFor(theme.panel, theme.variants[1])}</b></span></div>`;
      return `<section class="sample-ratio-theme"><h3>${theme.name} theme</h3>${stats}<div class="sample-ratio-theme-grid">${accents.flatMap((accent) => {
      const index = palette.indexOf(accent);
      const colors = colorsForAccent(accent);
      return theme.variants.map((key, index) => {
        const foreground = colors[key];
        const ratio = contrastRatio(hexToRgb(theme.panel), hexToRgb(foreground)).toFixed(2);
        return `<article class="sample-ratio-card"><div class="sample-ratio-color"><code>${theme.panel}</code><span class="sample-ratio-swatch" style="background:${theme.panel}"></span></div><div class="sample-ratio-color"><code>${foreground}</code><span class="sample-ratio-swatch" style="background:${foreground}"></span></div><span class="sample-ratio-value">${index ? "Secondary" : "Primary"} · ${ratio}:1</span></article>`;
      });
    }).join("")}</div></section>`;
    }).join("");
    sampleRatiosSection.hidden = false;
  }

  function polygonSpecimenSvg(secondary, primary, previousAccent, nextAccent) {
    return `<svg viewBox="0 0 240 120" role="img" aria-label="Dashed, solid, and split-color polygon examples">
      <polygon points="32,26 58,12 83,27 77,56 42,60" fill="none" stroke="${primary}" stroke-width="3" stroke-dasharray="7 5" />
      <polygon points="116,16 148,27 151,58 122,70 99,48" fill="${secondary}" />
      <polygon points="179,22 213,20 227,48 204,75 174,59" fill="none" stroke="${primary}" stroke-width="3" />
      ${[[179, 22], [213, 20], [227, 48], [204, 75], [174, 59]].map(([x, y], index) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${index % 2 ? previousAccent : nextAccent}" />`).join("")}
    </svg>`;
  }

  const GEOMETRIC_GLYPHS = "■□▢▣▤▥▦▧▨▩▪▫▬▭▮▯▰▱▲△▴▵▶▷▸▹►▻▼▽▾▿◀◁◂◃◄◅◆◇◈◉◊○◌◍◎●◐◑◒◓◔◕◖◗◘◙◚◛◜◝◞◟◠◡◢◣◤◥◦◧◨◩◪◫◬◭◮◯◰◱◲◳◴◵◶◷◸◹◺◻◼◽◾◿";

  function geometricGlyphRack(colors) {
    return `<div class="glyph-specimen"><h3><button type="button" class="glyph-toggle" aria-expanded="true" style="padding:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:inherit;letter-spacing:inherit;text-transform:inherit;cursor:pointer" onclick="var hide=this.getAttribute('aria-expanded')==='true';document.querySelectorAll('.glyph-rack').forEach(function(rack){rack.style.display=hide?'none':'grid'});document.querySelectorAll('.glyph-toggle').forEach(function(toggle){toggle.setAttribute('aria-expanded',String(!hide));toggle.textContent=hide?'Show geometric glyphs':'Hide geometric glyphs'})">Hide geometric glyphs</button></h3><div class="glyph-rack" style="grid-template-columns:repeat(6,minmax(0,1fr));grid-template-rows:repeat(16,1.6rem);grid-auto-flow:column">${[...GEOMETRIC_GLYPHS].map((glyph, index) => `<span style="color:${colors[index % colors.length]}">${glyph}</span>`).join("")}</div></div>`;
  }

  function accentPointLine(primary, secondary, otherAccents) {
    const markers = (variant, size) => otherAccents.map((color) => `<span style="color:${color[variant]};height:${size}px;padding:0 2px;border:0;border-radius:0;background:transparent;font-size:${size}px;line-height:${size}px;display:inline-flex;align-items:center">●#</span>`).join("");
    return `<div class="accent-point-lines" aria-label="Cross-contrast of other accent colors using primary and secondary variants"><div class="accent-point-line" style="--line:${primary};height:4px;min-height:4px;padding:0 4px;flex-wrap:nowrap;overflow:visible;background:${primary};margin:6px 0 22px">${markers("secondary", 16)}</div><div class="accent-point-line" style="--line:${secondary};height:4px;min-height:4px;padding:0 4px;flex-wrap:nowrap;overflow:visible;background:${secondary};margin:16px 0 22px">${markers("primary", 16)}</div><div class="accent-point-line" style="--line:${primary};height:24px;min-height:24px;padding:0 4px;flex-wrap:nowrap;overflow:hidden;background:${primary};margin:0 0 6px">${markers("secondary", 16)}</div><div class="accent-point-line" style="--line:${secondary};height:24px;min-height:24px;padding:0 4px;flex-wrap:nowrap;overflow:hidden;background:${secondary};margin:0">${markers("primary", 16)}</div></div>`;
  }

  function buildSamplePageHtml(themes, accents) {
    const variants = paletteVariants();
    const warmWith = parseColor(warmMixColor.value) || { r: 255, g: 138, b: 61 };
    const coolWith = parseColor(coolMixColor.value) || { r: 85, g: 157, b: 255 };
    const preview = escapeHtml(accentPreviewTextInput.value);
    const lorem = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer non lectus vel odio gravida finibus. Vivamus at massa id erat accumsan tincidunt.";
    const specimens = themes.map((theme, themeIndex) => {
      const accentExamples = accents.map((accent, exampleIndex) => {
        const accentIndex = palette.indexOf(accent);
        const soft = toHex(variants[0].colors[accentIndex]);
        const input = accent.hex;
        const dark = toHex(variants[2].colors[accentIndex]);
        const warm = toHex(mixRgb(accent.rgb, warmWith, Number(warmMixPercent.value) / 100));
        const cool = toHex(mixRgb(accent.rgb, coolWith, Number(coolMixPercent.value) / 100));
        const variantColors = { soft, input, dark, warm, cool };
        const primaryKey = theme.variants[0];
        const secondaryKey = theme.variants[1];
        const primary = variantColors[primaryKey];
        const secondary = variantColors[secondaryKey];
        const inputRatio = contrastRatio(hexToRgb(primary), hexToRgb(theme.panel)).toFixed(2);
        const activeStates = [
          { className: "t18", color: primary },
          { className: "t24", color: secondary }
        ];
        const tertiary = primary;
        const variantRatio = contrastRatio(hexToRgb(secondary), hexToRgb(theme.panel)).toFixed(2);
        const previousPaletteAccent = accents[(exampleIndex - 1 + accents.length) % accents.length];
        const nextPaletteAccent = accents[(exampleIndex + 1) % accents.length];
        const resolveAccentVariant = (paletteAccent, variantKey) => {
          const index = palette.indexOf(paletteAccent);
          const colors = {
            soft: toHex(variants[0].colors[index]),
            input: paletteAccent.hex,
            dark: toHex(variants[2].colors[index]),
            warm: toHex(mixRgb(paletteAccent.rgb, warmWith, Number(warmMixPercent.value) / 100)),
            cool: toHex(mixRgb(paletteAccent.rgb, coolWith, Number(coolMixPercent.value) / 100)),
          };
          return colors[variantKey];
        };
        const previousAccent = resolveAccentVariant(previousPaletteAccent, primaryKey);
        const nextAccent = resolveAccentVariant(nextPaletteAccent, secondaryKey);
        const otherAccentVariants = accents.filter((_, index) => index !== exampleIndex).map((otherAccent) => {
          const otherIndex = palette.indexOf(otherAccent);
          const otherColors = {
            soft: toHex(variants[0].colors[otherIndex]),
            input: otherAccent.hex,
            dark: toHex(variants[2].colors[otherIndex]),
            warm: toHex(mixRgb(otherAccent.rgb, warmWith, Number(warmMixPercent.value) / 100)),
            cool: toHex(mixRgb(otherAccent.rgb, coolWith, Number(coolMixPercent.value) / 100)),
          };
          return { primary: otherColors[primaryKey], secondary: otherColors[secondaryKey] };
        });
        return `<article class="accent-example" style="--primary:${primary};--secondary:${secondary};--input:${primary}">
          <header><span class="accent-index">${accentIndex + 1}</span><code>${primary}</code><span class="contrast-ratio">Primary ${inputRatio}:1 · Secondary ${variantRatio}:1</span></header>
          <div class="type-specimen">
            ${activeStates.map((state) => `<p class="${state.className}" style="color:${state.color}">${preview}</p>`).join("")}
          </div>
          <h2 style="color:${primary}">Measured title text</h2>
          <p class="subtitle" style="color:${secondary}">A practical subtitle for this accent.</p>
          <p class="small-body" style="color:${secondary}">${lorem}</p>
          <p class="note" style="color:${tertiary}">Smaller primary note text, <a href="#" style="color:${primary}">a useful inline link</a>, and a quieter secondary detail.</p>
          <p class="note" style="color:${secondary}">Smaller modifier note text, with the same compact supporting detail.</p>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:.8rem 0"><p style="margin:0;color:${primary};font:600 .85rem/1.35 Figtree,system-ui,sans-serif">Jer mi je mučno biti slab,<br>jer mi je mučno biti sam<br>(kada bih mogo biti jak,<br>kada bih mogo biti drag)</p><p style="margin:0;color:${secondary};font:600 .85rem/1.35 Figtree,system-ui,sans-serif">Jer mi je mučno biti slab,<br>jer mi je mučno biti sam<br>(kada bih mogo biti jak,<br>kada bih mogo biti drag)</p></div>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:.8rem 0"><blockquote style="margin:0;padding-left:8px;border-left:2px solid ${primary};color:${primary};font:600 1rem/1.35 'Crimson Text',Georgia,serif">Gáttir allar,<br>áðr gangi fram,<br>um skoðask skyli,<br>um skyggnast skyli.</blockquote><blockquote style="margin:0;padding-left:8px;border-left:2px solid ${secondary};color:${secondary};font:600 1rem/1.35 'Crimson Text',Georgia,serif">Gáttir allar,<br>áðr gangi fram,<br>um skoðask skyli,<br>um skyggnast skyli.</blockquote></div>
          <div style="color:${tertiary};margin:.7rem 0"><p class="data-line" style="margin:1px 0">Δx = [x₂ − x₁] / n</p><p class="data-line" style="margin:1px 0">‖v‖² = ⟨v, v⟩ ≥ 0</p><p class="data-line" style="margin:1px 0">(x + y)ⁿ = Σₖ₌₀ⁿ C(n,k)xⁿ⁻ᵏyᵏ</p></div>
          <div style="color:${secondary};margin:.7rem 0"><p class="data-line" style="margin:1px 0">Δx = [x₂ − x₁] / n</p><p class="data-line" style="margin:1px 0">‖v‖² = ⟨v, v⟩ ≥ 0</p><p class="data-line" style="margin:1px 0">(x + y)ⁿ = Σₖ₌₀ⁿ C(n,k)xⁿ⁻ᵏyᵏ</p></div>
          <div class="ui-row">
            <button style="background:${primary}">Primary action</button>
            <button class="outline" style="color:${tertiary};border-color:${tertiary}">Secondary action</button>
            <button class="status" style="color:${secondary};border-color:${secondary}">Status</button>
          </div>
          <div class="control-samples" style="color:${tertiary}"><label>Sample slider<input type="range" value="58" style="accent-color:${primary}"></label><label>Sample dropdown<select style="border-color:${secondary};color:${tertiary}"><option>Choose an option</option><option>Second option</option></select></label><label>Sample input<input placeholder="A quiet input" style="border-color:${secondary};color:${tertiary}"></label></div>
          <div class="geometry">${polygonSpecimenSvg(secondary, primary, previousAccent, nextAccent)}</div>
          ${accentPointLine(primary, secondary, otherAccentVariants)}
          ${geometricGlyphRack(activeStates.map((state) => state.color))}
        </article>`;
      }).join("");
      const typography = themeIndex === 0 ? `<style>@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Figtree:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap');body{font-family:Figtree,system-ui,sans-serif}.page-intro h1{font-family:Fraunces,Georgia,serif;font-weight:700}.page-nav span,.accent-example header,.contrast-ratio,.data-line{font-family:'DM Mono',ui-monospace,monospace}.accent-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.subtitle{margin:.25rem 0 .5rem;font-size:.9rem;font-weight:600}.small-body{font-size:.82rem}.note{font-size:.72rem}.data-line{margin:.7rem 0;font-size:.68rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ui-row .status{background:transparent}.control-samples{display:grid;gap:8px;margin-top:14px}.control-samples label{font-size:.7rem}.control-samples input,.control-samples select{display:block;width:100%;margin-top:4px;padding:6px;border:1px solid;border-radius:5px;background:transparent;color:inherit;font:inherit}.control-samples input[type=range]{padding:0;border:0;border-radius:0}.control-samples select{height:31px}.accent-point-line{position:relative;display:flex;flex-wrap:wrap;gap:5px;align-items:center;min-height:25px;margin:10px 0 0;padding:3px 5px}.accent-point-line:before{content:"";position:absolute;z-index:0;left:0;right:0;top:50%;height:2px;background:var(--line)}.accent-point-line span{position:relative;z-index:1;padding:0 2px;background:var(--panel);font:500 .75rem/1 'DM Mono',ui-monospace,monospace}@media(max-width:1100px){.accent-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:840px){.accent-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:640px){.accent-grid{grid-template-columns:1fr}}</style>` : "";
      const norseTypeface = themeIndex === 0 ? `<style>@import url('https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');</style>` : "";
      return `${typography}${norseTypeface}<section class="page-specimen" style="--surface:${theme.surface};--panel:${theme.panel};--ink:${theme.text};color:${theme.text}" data-background="${theme.surface}">
        <div class="page-nav"><strong>${theme.kind === "light" ? "Light" : "Dark"} theme</strong><span>${theme.surface}</span><span>Archive</span><span>About</span></div>
        <div class="page-intro"><p>Palette sample page</p><h1>Colors in a working document</h1><p>${lorem}</p></div>
        <div class="accent-grid">${accentExamples}</div>
      </section>`;
    }).join("");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Palette sample page</title><style>
      *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#15171b;color:#16181c} .page-specimen{--ink:#202124;background:var(--surface);padding:28px clamp(18px,4vw,56px) 52px;min-height:100vh}.page-nav{display:flex;gap:18px;align-items:center;padding-bottom:18px;border-bottom:1px solid color-mix(in srgb,var(--ink) 22%,transparent);font-size:.82rem}.page-nav strong{margin-right:auto}.page-intro{max-width:740px;padding:42px 0 28px}.page-intro p:first-child{text-transform:uppercase;letter-spacing:.12em;font-size:.74rem}.page-intro h1{font-size:clamp(2.2rem,6vw,4.5rem);line-height:.95;margin:.2em 0}.page-intro p{line-height:1.6;max-width:62ch}.accent-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}.accent-example{padding:18px;border:1px solid color-mix(in srgb,var(--ink) 26%,transparent);border-radius:12px;background:var(--panel);box-shadow:0 4px 18px color-mix(in srgb,var(--ink) 10%,transparent)}.accent-example header{display:flex;gap:8px;align-items:center}.accent-index{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--input);color:#fff;font-size:.72rem}.accent-example code{font-size:.75rem}.contrast-ratio{margin-left:auto;font:700 .78rem/1 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:nowrap}.type-specimen{padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--ink) 18%,transparent)}.type-specimen p{margin:2px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.t12{font-size:12pt}.t18{font-size:18pt}.t24{font-size:24pt}.accent-example h2{font-size:1.25rem;margin:18px 0 8px}.accent-example p{line-height:1.5}.ui-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:16px 0}.ui-row button{border:1px solid transparent;border-radius:6px;padding:8px 10px;color:#fff;font:inherit;cursor:pointer}.ui-row .outline{background:transparent}.badge{border:1px solid;border-radius:999px;padding:5px 9px;font-size:.78rem}label{display:block;font-size:.78rem;font-weight:600}input{display:block;width:100%;margin-top:5px;padding:8px;border:1px solid;border-radius:6px;background:transparent;font:inherit}.geometry{margin-top:20px;border-top:1px solid color-mix(in srgb,var(--ink) 18%,transparent);padding-top:14px}.geometry svg{width:100%;height:auto;display:block}.glyph-specimen{margin-top:20px;border-top:1px solid color-mix(in srgb,var(--ink) 18%,transparent);padding-top:14px}.glyph-specimen h3{margin:0 0 10px;font-size:.8rem;text-transform:uppercase;letter-spacing:.08em}.glyph-rack{display:grid;grid-template-columns:repeat(16,1fr);gap:3px;font-size:1.15rem;line-height:1;text-align:center}.glyph-rack span{padding:3px 0;border:1px solid color-mix(in srgb,var(--ink) 12%,transparent)}@media(max-width:640px){.page-specimen{padding:20px}.page-nav{gap:10px}.page-nav span{display:none}.page-nav span:first-of-type{display:inline}.accent-grid{grid-template-columns:1fr}.glyph-rack{grid-template-columns:repeat(12,1fr)}}</style></head><body>${specimens}</body></html>`;
  }

  function openSamplePage() {
    const lightSurface = samplePageLightSurface.dataset.value;
    const darkSurface = samplePageDarkSurface.dataset.value;
    const roleHexes = new Set([lightSurface, samplePageLightPanel.dataset.value, samplePageLightText.dataset.value, darkSurface, samplePageDarkPanel.dataset.value, samplePageDarkText.dataset.value]);
    const accents = palette.filter((color) => !roleHexes.has(color.hex) && samplePageAccentHexes.has(color.id));
    if (lightSurface === darkSurface || !accents.length) return;
    const selectedVariant = (setting, fallback) => {
      const variant = setting.load();
      return ["soft", "input", "dark", "warm", "cool"].includes(variant) ? variant : fallback;
    };
    const themes = [
      { kind: "light", surface: lightSurface, panel: samplePageLightPanel.dataset.value, text: samplePageLightText.dataset.value, variants: [selectedVariant(samplePageLightPrimarySetting, "input"), selectedVariant(samplePageLightSecondarySetting, "dark")] },
      { kind: "dark", surface: darkSurface, panel: samplePageDarkPanel.dataset.value, text: samplePageDarkText.dataset.value, variants: [selectedVariant(samplePageDarkPrimarySetting, "soft"), selectedVariant(samplePageDarkSecondarySetting, "input")] },
    ];
    const sampleWindow = window.open("", "_blank");
    if (!sampleWindow) {
      samplePageError.textContent = "The new tab was blocked by the browser. Allow pop-ups for this app and try again.";
      return;
    }
    sampleWindow.document.open();
    sampleWindow.document.write(buildSamplePageHtml(themes, accents));
    sampleWindow.document.close();
    sampleWindow.opener = null;
  }

  function renderRankings() {
    const show = palette.length >= 2;
    rankingsSection.hidden = !show;
    if (!show) {
      rankingsHead.innerHTML = "";
      rankingsBody.innerHTML = "";
      return;
    }

    const visionMode = visionSelect.value;
    const simulating = visionMode !== "none";

    const pairs = [];
    for (let i = 0; i < palette.length; i++) {
      for (let j = i + 1; j < palette.length; j++) {
        const a = palette[i], b = palette[j];
        const ratio = contrastRatio(a.rgb, b.rgb);
        const entry = { a, b, ...evaluate(ratio) };
        if (simulating) {
          const simRatio = contrastRatio(simulateVision(a.rgb, visionMode), simulateVision(b.rgb, visionMode));
          entry.simRatio = simRatio;
          entry.simLevel = bestLevel(evaluate(simRatio));
        }
        pairs.push(entry);
      }
    }
    pairs.sort((x, y) => y.ratio - x.ratio);

    const headLabels = ["Pair", "Ratio", "AA Normal", "AAA Normal", "AA Large", "AAA Large"];
    if (simulating) headLabels.push(`Simulated Ratio`, `Simulated Level`);
    rankingsHead.innerHTML = `<tr>${headLabels.map((h) => `<th scope="col">${h}</th>`).join("")}</tr>`;

    rankingsBody.innerHTML = pairs.map((p) => `
      <tr>
        <td>
          <span class="pair-swatches">
            <span class="pair-swatch" style="background:${p.a.hex}"></span><span class="pair-swatch" style="background:${p.b.hex}"></span>
          </span>
          <span class="pair-hex">${p.a.hex} / ${p.b.hex}</span>
        </td>
        <td class="ratio-value">${p.ratio.toFixed(2)}:1</td>
        <td>${resultIcon(p.aaNormal)}</td>
        <td>${resultIcon(p.aaaNormal)}</td>
        <td>${resultIcon(p.aaLarge)}</td>
        <td>${resultIcon(p.aaaLarge)}</td>
        ${simulating ? `<td class="ratio-value">${p.simRatio.toFixed(2)}:1</td><td>${levelBadgeHtml(p.simLevel)}</td>` : ""}
      </tr>
    `).join("");
  }

  function renderColorField() {
    const show = palette.length > 0;
    colorFieldSection.hidden = !show;
    if (!show) {
      colorFieldLegend.innerHTML = "";
      return;
    }

    const rect = colorFieldCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (colorFieldCanvas.width !== width || colorFieldCanvas.height !== height) {
      colorFieldCanvas.width = width;
      colorFieldCanvas.height = height;
    }
    const ctx = colorFieldCanvas.getContext("2d");
    const pixels = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      const lightness = (1 - y / Math.max(1, height - 1)) * 100;
      for (let x = 0; x < width; x++) {
        const hue = x / Math.max(1, width - 1) * 360;
        const rgb = hslToRgb(hue, 100, lightness);
        const i = (y * width + x) * 4;
        pixels.data[i] = rgb.r;
        pixels.data[i + 1] = rgb.g;
        pixels.data[i + 2] = rgb.b;
        pixels.data[i + 3] = 255;
      }
    }
    ctx.putImageData(pixels, 0, 0);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach((fraction) => {
      ctx.beginPath();
      ctx.moveTo(0, rect.height * fraction);
      ctx.lineTo(rect.width, rect.height * fraction);
      ctx.stroke();
    });
    palette.forEach((color, index) => {
      const hsl = rgbToHsl(color.rgb);
      const x = hsl.h / 360 * rect.width;
      const y = (1 - hsl.l / 100) * rect.height;
      const labelColor = relativeLuminance(color.rgb) > 0.35 ? "#101216" : "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = color.hex;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
      ctx.stroke();
      ctx.fillStyle = labelColor;
      ctx.font = "600 10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(index + 1), x, y + 0.5);
    });
    ctx.restore();

    colorFieldCanvas.setAttribute("aria-label", `Palette color field with ${palette.length} color${palette.length === 1 ? "" : "s"}, positioned by hue and luminance.`);
    colorFieldLegend.innerHTML = palette.map((color, index) => `
      <span class="color-field-key"><span class="color-field-key-dot" style="background:${color.hex}">${index + 1}</span>${color.hex}</span>
    `).join("");
  }

  const oklabView = { yaw: -0.7, pitch: 0.38, dragging: false, x: 0, y: 0 };

  function renderOklabView() {
    const show = palette.length > 0;
    oklabViewSection.hidden = !show;
    if (!show) {
      oklabViewLegend.innerHTML = "";
      return;
    }
    const rect = oklabViewCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (oklabViewCanvas.width !== width || oklabViewCanvas.height !== height) {
      oklabViewCanvas.width = width;
      oklabViewCanvas.height = height;
    }
    const ctx = oklabViewCanvas.getContext("2d");
    const styles = getComputedStyle(document.documentElement);
    const border = styles.getPropertyValue("--border").trim() || "#dde1e7";
    const text = styles.getPropertyValue("--text").trim() || "#1a1d23";
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const project = ({ x, y, z }) => {
      const cosYaw = Math.cos(oklabView.yaw), sinYaw = Math.sin(oklabView.yaw);
      const cosPitch = Math.cos(oklabView.pitch), sinPitch = Math.sin(oklabView.pitch);
      const horizontal = x * cosYaw - z * sinYaw;
      const depth = x * sinYaw + z * cosYaw;
      const vertical = y * cosPitch - depth * sinPitch;
      const finalDepth = y * sinPitch + depth * cosPitch;
      const scale = 1.35 / (1.85 + finalDepth * 0.45);
      return {
        x: rect.width / 2 + horizontal * rect.width * 0.29 * scale,
        y: rect.height / 2 - vertical * rect.height * 0.37 * scale,
        depth: finalDepth,
        scale,
      };
    };

    const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => ({ x, y, z }))));
    const edges = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
    const projectedCorners = corners.map(project);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    edges.forEach(([start, end]) => {
      ctx.beginPath();
      ctx.moveTo(projectedCorners[start].x, projectedCorners[start].y);
      ctx.lineTo(projectedCorners[end].x, projectedCorners[end].y);
      ctx.stroke();
    });

    const origin = project({ x: 0, y: -1, z: 0 });
    const axes = [
      { point: { x: 1, y: -1, z: 0 }, label: "a" },
      { point: { x: 0, y: 1, z: 0 }, label: "L" },
      { point: { x: 0, y: -1, z: 1 }, label: "b" },
    ];
    ctx.strokeStyle = text;
    axes.forEach(({ point, label }) => {
      const end = project(point);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.fillStyle = text;
      ctx.font = "500 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, end.x, end.y - 10);
    });

    const points = palette.map((color, index) => {
      const lab = rgbToOklab(color.rgb);
      return { color, index, position: project({ x: lab.a / 0.4, y: lab.l * 2 - 1, z: lab.b / 0.4 }) };
    }).sort((left, right) => left.position.depth - right.position.depth);
    points.forEach(({ color, index, position }) => {
      const radius = 8 * position.scale;
      ctx.beginPath();
      ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color.hex;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
      ctx.stroke();
      ctx.fillStyle = relativeLuminance(color.rgb) > 0.35 ? "#101216" : "#ffffff";
      ctx.font = "600 10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(index + 1), position.x, position.y + 0.5);
    });
    ctx.restore();

    oklabViewCanvas.setAttribute("aria-label", `Rotatable 3D OKLab plot with ${palette.length} palette color${palette.length === 1 ? "" : "s"}.`);
    oklabViewLegend.innerHTML = palette.map((color, index) => `
      <span class="color-field-key"><span class="color-field-key-dot" style="background:${color.hex}">${index + 1}</span>${color.hex}</span>
    `).join("");
  }

  function resultIcon(pass) {
    return `<span class="result-icon ${pass ? "pass" : "fail"}">${pass ? "✓" : "✕"}</span>`;
  }

  function renderAll() {
    renderAdjustedPalette();
    renderPresets();
    savePalette();
    savePresets();
  }

  largeTextToggle.addEventListener("change", () => {
    largeTextSetting.save(largeTextToggle.checked);
    renderAdjustedPalette();
  });
  previewTextInput.addEventListener("input", () => {
    previewTextSetting.save(previewTextInput.value);
    renderAdjustedPalette();
  });
  accentPreviewTextInput.addEventListener("input", () => {
    accentPreviewTextSetting.save(accentPreviewTextInput.value);
    renderAdjustedPalette();
  });
  accentVariantSelector.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-variant]");
    if (!button) return;
    const selected = new Set(accentVariantsSetting.load().split(",").filter(Boolean));
    if (selected.has(button.dataset.variant)) {
      if (selected.size === 1) return;
      selected.delete(button.dataset.variant);
    } else {
      selected.add(button.dataset.variant);
    }
    accentVariantsSetting.save([...selected].join(","));
    renderAdjustedPalette();
  });
  let draggedAccentVariant = null;
  accentVariantSelector.addEventListener("dragstart", (event) => {
    const button = event.target.closest("button[data-variant][aria-pressed='true']");
    if (!button) {
      event.preventDefault();
      return;
    }
    draggedAccentVariant = button.dataset.variant;
    button.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
  });
  accentVariantSelector.addEventListener("dragover", (event) => {
    if (draggedAccentVariant) event.preventDefault();
  });
  accentVariantSelector.addEventListener("drop", (event) => {
    const target = event.target.closest("button[data-variant][aria-pressed='true']");
    if (!draggedAccentVariant || !target || target.dataset.variant === draggedAccentVariant) return;
    event.preventDefault();
    const order = accentVariantsSetting.load().split(",").filter((key) => ["soft", "input", "dark", "warm", "cool"].includes(key));
    const from = order.indexOf(draggedAccentVariant);
    const to = order.indexOf(target.dataset.variant);
    if (from === -1 || to === -1) return;
    order.splice(from, 1);
    order.splice(to, 0, draggedAccentVariant);
    accentVariantsSetting.save(order.join(","));
    renderAdjustedPalette();
  });
  accentVariantSelector.addEventListener("dragend", () => {
    accentVariantSelector.querySelectorAll(".dragging").forEach((button) => button.classList.remove("dragging"));
    draggedAccentVariant = null;
  });
  const samplePageRoleControls = [
    [samplePageLightSurface, samplePageLightSurfaceSetting],
    [samplePageLightPanel, samplePageLightPanelSetting],
    [samplePageLightText, samplePageLightTextSetting],
    [samplePageDarkSurface, samplePageDarkSurfaceSetting],
    [samplePageDarkPanel, samplePageDarkPanelSetting],
    [samplePageDarkText, samplePageDarkTextSetting],
  ];
  samplePageRoleControls.forEach(([control, setting]) => {
    control.addEventListener("click", (event) => {
      const swatch = event.target.closest(".sample-page-role-swatch");
      if (!swatch) return;
      setting.save(swatch.dataset.hex);
      renderAdjustedPalette();
    });
  });
  [[samplePageLightPrimary, samplePageLightPrimarySetting], [samplePageLightSecondary, samplePageLightSecondarySetting], [samplePageDarkPrimary, samplePageDarkPrimarySetting], [samplePageDarkSecondary, samplePageDarkSecondarySetting]].forEach(([container, setting]) => {
    container.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-variant]");
      if (!button) return;
      setting.save(button.dataset.variant);
      renderAdjustedPalette();
    });
  });
  samplePageAccentSelector.addEventListener("click", (event) => {
    const swatch = event.target.closest(".sample-page-accent-choice");
    if (!swatch) return;
    const id = Number(swatch.dataset.id);
    if (samplePageAccentHexes.has(id)) samplePageAccentHexes.delete(id);
    else samplePageAccentHexes.add(id);
    saveSamplePageAccents();
    renderAdjustedPalette();
  });
  openSamplePageBtn.addEventListener("click", openSamplePage);
  swapAxesToggle.addEventListener("change", () => {
    swapAxesSetting.save(swapAxesToggle.checked);
    renderAdjustedPalette();
  });
  visionSelect.addEventListener("change", () => {
    visionModeSetting.save(visionSelect.value);
    renderAdjustedPalette();
  });

  function bindRainbowRecipe(colorInput, percentInput, valueOutput, colorSetting, percentSetting) {
    const update = () => {
      valueOutput.value = `${percentInput.value}%`;
      valueOutput.textContent = `${percentInput.value}%`;
      colorSetting.save(colorInput.value);
      percentSetting.save(percentInput.value);
      renderAdjustedPalette();
    };
    colorInput.addEventListener("input", update);
    colorInput.addEventListener("click", (event) => {
      event.preventDefault();
      const label = colorInput.id.replace("MixColor", "").replace(/^./, (letter) => letter.toUpperCase());
      openRecipePopover(colorInput, colorSetting, label, event);
    });
    percentInput.addEventListener("input", update);
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!copied) throw new Error("Clipboard copy was unavailable.");
  }

  function bindHexCopy(container, selector) {
    container.addEventListener("click", async (event) => {
      const button = event.target.closest(selector);
      if (!button) return;
      const hex = button.dataset.hex;
      try {
        await copyText(hex);
        button.textContent = "Copied";
        button.classList.add("copied");
        window.setTimeout(() => {
          button.textContent = hex;
          button.classList.remove("copied");
        }, 1000);
      } catch (e) {
        button.textContent = "Copy failed";
        window.setTimeout(() => { button.textContent = hex; }, 1200);
      }
    });
  }

  bindHexCopy(customRainbow, ".rainbow-hex");
  bindHexCopy(temperatureRainbow, ".rainbow-hex");
  document.addEventListener("contextmenu", (event) => {
    const inputHex = event.target.closest("[data-palette-id]");
    if (!inputHex) return;
    const color = palette.find((entry) => entry.id === Number(inputHex.dataset.paletteId));
    if (!color) return;
    event.preventDefault();
    openEditPopover(color, event);
  });
  bindHexCopy(punnettGrid, ".grid-hex");
  bindHexCopy(paletteList, ".palette-band-hex");

  function closeVisionInfo() {
    visionInfoTooltip.hidden = true;
    visionInfoBtn.setAttribute("aria-expanded", "false");
  }
  visionInfoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = visionInfoTooltip.hidden;
    visionInfoTooltip.hidden = !willOpen;
    visionInfoBtn.setAttribute("aria-expanded", String(willOpen));
  });
  document.addEventListener("click", (e) => {
    if (!visionInfoTooltip.hidden && e.target !== visionInfoBtn && !visionInfoTooltip.contains(e.target)) {
      closeVisionInfo();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !visionInfoTooltip.hidden) closeVisionInfo();
  });

  function applyCellSize(px) {
    punnettGrid.style.setProperty("--cell-size", `${px}px`);
    // Match the contrast-grid swatch geometry exactly: its sample uses a
    // 176:150 aspect ratio.
    const rainbowWidth = Number(px);
    const rainbowHeight = Math.round(Number(px) * 150 / 176);
    customRainbow.style.setProperty("--rainbow-swatch-width", `${rainbowWidth}px`);
    customRainbow.style.setProperty("--rainbow-swatch-height", `${rainbowHeight}px`);
    temperatureRainbow.style.setProperty("--rainbow-swatch-width", `${rainbowWidth}px`);
    temperatureRainbow.style.setProperty("--rainbow-swatch-height", `${rainbowHeight}px`);
    cellSizeValue.textContent = `${px}px`;
  }
  cellSizeSlider.addEventListener("input", () => {
    applyCellSize(cellSizeSlider.value);
    cellSizeSetting.save(cellSizeSlider.value);
  });
  oklabViewCanvas.addEventListener("pointerdown", (event) => {
    oklabView.dragging = true;
    oklabView.x = event.clientX;
    oklabView.y = event.clientY;
    oklabViewCanvas.setPointerCapture(event.pointerId);
  });
  oklabViewCanvas.addEventListener("pointermove", (event) => {
    if (!oklabView.dragging) return;
    oklabView.yaw += (event.clientX - oklabView.x) * 0.012;
    oklabView.pitch = Math.max(-1.15, Math.min(1.15, oklabView.pitch + (event.clientY - oklabView.y) * 0.012));
    oklabView.x = event.clientX;
    oklabView.y = event.clientY;
    withAdjustedPalette(renderOklabView);
  });
  const stopOklabDrag = () => { oklabView.dragging = false; };
  oklabViewCanvas.addEventListener("pointerup", stopOklabDrag);
  oklabViewCanvas.addEventListener("pointercancel", stopOklabDrag);
  window.addEventListener("resize", () => {
    withAdjustedPalette(renderColorField);
    withAdjustedPalette(renderOklabView);
  });

  function setupPanelFolding() {
    const folds = loadPanelFolds();
    const alwaysOpenPanels = new Set(["add-color-heading", "global-adjust-heading", "presets-heading", "palette-heading"]);
    document.querySelectorAll("main > .panel, main > .top-grid .panel").forEach((panel) => {
      const heading = panel.querySelector("h2[id]");
      if (!heading) return;
      const key = heading.id;
      if (alwaysOpenPanels.has(key)) return;
      const header = heading.closest(".section-heading-row") || heading;
      const contentNodes = Array.from(panel.children).filter((node) => node !== header);
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "panel-fold-toggle";
      toggle.setAttribute("aria-label", `Collapse ${heading.textContent.trim()}`);
      heading.appendChild(toggle);

      const setFolded = (folded) => {
        panel.classList.toggle("is-folded", folded);
        contentNodes.forEach((node) => { node.hidden = folded; });
        toggle.setAttribute("aria-expanded", String(!folded));
        toggle.setAttribute("aria-label", `${folded ? "Expand" : "Collapse"} ${heading.textContent.trim()}`);
        if (!folded && (key === "color-field-heading" || key === "oklab-view-heading")) {
          requestAnimationFrame(() => {
            if (key === "color-field-heading") withAdjustedPalette(renderColorField);
            else withAdjustedPalette(renderOklabView);
          });
        }
      };
      setFolded(folds[key] === true);
      toggle.addEventListener("click", () => {
        const folded = !panel.classList.contains("is-folded");
        folds[key] = folded;
        setFolded(folded);
        savePanelFolds(folds);
      });
    });
  }

  // ---------- Init ----------

  setupPanelFolding();
  loadPalette();
  loadPresets();
  loadAccentBackgrounds();
  loadAccentComparisons();
  loadSamplePageAccents();
  loadExportFamilies();
  softenMixColor.value = softenMixColorSetting.load();
  darkenMixColor.value = darkenMixColorSetting.load();
  softenMixPercent.value = softenMixPercentSetting.load();
  darkenMixPercent.value = darkenMixPercentSetting.load();
  warmMixColor.value = warmMixColorSetting.load();
  coolMixColor.value = coolMixColorSetting.load();
  warmMixPercent.value = warmMixPercentSetting.load();
  coolMixPercent.value = coolMixPercentSetting.load();
  bindRainbowRecipe(softenMixColor, softenMixPercent, softenMixValue, softenMixColorSetting, softenMixPercentSetting);
  bindRainbowRecipe(darkenMixColor, darkenMixPercent, darkenMixValue, darkenMixColorSetting, darkenMixPercentSetting);
  bindRainbowRecipe(warmMixColor, warmMixPercent, warmMixValue, warmMixColorSetting, warmMixPercentSetting);
  bindRainbowRecipe(coolMixColor, coolMixPercent, coolMixValue, coolMixColorSetting, coolMixPercentSetting);
  [[softenMixReset, softenMixColor, "#e5dcd7"], [darkenMixReset, darkenMixColor, "#1a1a1a"], [warmMixReset, warmMixColor, "#ff8a3d"], [coolMixReset, coolMixColor, "#559dff"]].forEach(([button, input, hex]) => {
    button.addEventListener("click", () => {
      input.value = hex;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
  softenMixValue.value = `${softenMixPercent.value}%`;
  softenMixValue.textContent = `${softenMixPercent.value}%`;
  darkenMixValue.value = `${darkenMixPercent.value}%`;
  darkenMixValue.textContent = `${darkenMixPercent.value}%`;
  warmMixValue.value = `${warmMixPercent.value}%`;
  warmMixValue.textContent = `${warmMixPercent.value}%`;
  coolMixValue.value = `${coolMixPercent.value}%`;
  coolMixValue.textContent = `${coolMixPercent.value}%`;
  swapAxesToggle.checked = swapAxesSetting.load();
  largeTextToggle.checked = largeTextSetting.load();
  visionSelect.value = visionModeSetting.load();
  previewTextInput.value = previewTextSetting.load();
  accentPreviewTextInput.value = accentPreviewTextSetting.load();
  cellSizeSlider.value = cellSizeSetting.load();
  applyCellSize(cellSizeSlider.value);
  renderAll();
})();
