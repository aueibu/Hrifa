import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const GROUND_SIZE = 2;
const SETTLE_LINEAR = 0.03;
const SETTLE_ANGULAR = 0.05;
const SETTLE_FRAMES = 40;
const MAX_ROUND_MS = 12000;
const OFF_SURFACE_Y = -0.25;
const HEIGHTFIELD_SEGMENTS = 24;
const MAX_BUMP_HEIGHT = 0.03; // meters, at roughness 1.0
const MIN_SUBSTEPS = 4;
const MAX_SUBSTEPS = 96;

// Bibliography backing the material/surface physics below. Density, elastic
// modulus, and hardness for the 18 elements, the 6 promoted non-metal
// materials (cast iron, granite, PMMA, sapphire/alumina, nylon, PTFE), and the
// 18 named wood species (16 species plus White Oak and Northern Red Oak) come
// from the project's ASM Handbook extraction, EMH/Cardarelli mining, and USDA
// Wood Handbook mining (see the ASM_Material_Properties_Reference.xlsx
// reference workbook, "Material Properties" sheet, for the exact table/page
// per material). Self-coefficient-of-restitution is COMPUTED at drop time via
// a validated elastic-plastic yield model for every ductile material (not
// looked up), and friction uses real CRC-measured values where available,
// falling back to a hardness-ranked or literature-informed estimate
// otherwise. Every material in this roster is available as both an object
// and a surface. See resolvePairPhysics().
const SOURCES = {
  asmPureMetals: {
    short: 'ASM Handbook Vol. 2, "Properties of Pure Metals"',
    full: 'ASM Handbook Vol. 2 (Nonferrous Alloys and Special-Purpose Materials), "Properties of Pure Metals" article — primary source for density, elastic modulus, and hardness of most elements in this roster.',
    verified: true,
  },
  asmVol1Iron: {
    short: 'ASM Handbook Vol. 1, iron density/modulus/hardness tables',
    full: 'ASM Handbook Vol. 1 (Irons, Steels, and High-Performance Alloys): pure iron assembled from a theoretical full-density figure, a powder-metallurgy density-vs-modulus table extrapolated to full density, and a ferritic-ingot-iron wear-rate table for hardness.',
    verified: true,
  },
  asmRefractory: {
    short: 'ASM Handbook Vol. 2, "Refractory Metals and Alloys," Table 2 & 7',
    full: 'ASM Handbook Vol. 2, "Refractory Metals and Alloys" article, Tables 2 and 7 — used for tungsten and molybdenum, cross-checked against niobium.',
    verified: true,
  },
  asmAlloySupplement: {
    short: 'ASM Handbook Vol. 2, closest unalloyed/dilute wrought-alloy grade',
    full: 'One property (usually hardness or modulus) was not tabulated as an explicit number for the pure element in the reviewed ASM text; a standard engineering reference value or the closest unalloyed/dilute alloy grade in the same ASM volume was substituted instead. See the reference workbook\'s Material Properties sheet, Notes column, for the specific substitution.',
    verified: true,
  },
  hardnessEstimate: {
    short: 'non-ASM hardness estimate (titanium, zirconium, niobium)',
    full: 'ASM\'s "Properties of Pure Metals" article has no Mechanical Properties data for this element (a confirmed gap in the source, checked against the original book pages). Hardness is a standard external reference value or is bounded by more-alloyed grades of the same element elsewhere in the ASM volume; self-COR/friction computed from it inherit that added uncertainty.',
    verified: false,
  },
  graphiteEstimate: {
    short: 'web search: isostatic graphite manufacturer datasheets',
    full: 'No ASM, CRC, Stronge, or Johnson source in this project\'s document set has density, modulus, or hardness data for carbon/graphite. Density and elastic modulus (~11 GPa, midpoint of a 9.8-13.7 GPa typical isostatic-grade range) were sourced via web search from isostatic-graphite manufacturer datasheets (Tokai Carbon, Olmec) — a real but grade-averaged, non-primary source. Graphite is also a brittle, layered material outside the validated ductile elastic-plastic yield model used for the other 17 elements (the same category as the ceramics/rock this project explicitly flagged as "no formula, genuine gap"), so its restitution and friction are flagged literature-informed placeholders, not computed from the formula.',
    verified: false,
  },
  expandedRosterEMHCardarelli: {
    short: 'EMH Desk Edition + Materials Handbook (Cardarelli) — non-metal roster',
    full: 'Density, elastic modulus, and hardness for granite, PMMA/acrylic, sapphire/alumina, nylon 6,6, and PTFE come from the project\'s mining of the compiled Engineered Materials Handbook (EMH Desk Edition 1-4) and Materials Handbook 2017 (Cardarelli) — see the reference workbook\'s Material Properties sheet for the exact tables. All five are outside the validated Stronge/Johnson ductile elastic-plastic yield model: granite and sapphire/alumina are brittle ceramics/rock (same "no formula, genuine gap" category as diamond, per the COR Methodology sheet); PMMA, nylon, and PTFE are polymers whose damping behavior isn\'t derivable from bulk elastic constants without a measured calibration point this project doesn\'t have. Their restitution and (except where a direct CRC friction measurement exists) friction are flagged literature-informed placeholders, not computed from the formula. Sapphire/alumina\'s surface role is this app\'s own extension beyond the reference workbook, which only scoped it as an object — added as a ceramics-surface example.',
    verified: true,
  },
  castIronValidated: {
    short: 'Materials Handbook (Cardarelli) + EMH; self-COR computed (Stronge/Johnson)',
    full: 'Cast iron (gray, ASTM A48 Grade 40) density and modulus from Materials Handbook 2017 (Cardarelli), Table 2.14; hardness and supplementary tensile ranges from EMH Desk Edition 1-4. Unlike granite/sapphire/PMMA/nylon/PTFE, cast iron has a real ductile phase (ferrite/pearlite matrix), so the same validated Stronge/Johnson elastic-plastic yield model used for the 18 pure elements applies directly — self-COR is computed, not estimated. Poisson\'s ratio is Johnson\'s generic cast-iron value (Contact Mechanics, Table 5.1), not grade-specific.',
    verified: true,
  },
  usdaWoodHandbook: {
    short: 'USDA Wood Handbook, Table 4-3a / 4-1 / 4-2 (species-specific, 12% MC)',
    full: 'Density (specific gravity x 1000) and elastic modulus (parallel-to-grain static bending MOE) for all 18 wood entries (16 named species plus White Oak and Northern Red Oak) come from the USDA Forest Products Laboratory Wood Handbook, Table 4-3a (metric, 12% moisture content); the two Oak entries additionally have full anisotropic Poisson\'s-ratio data from Tables 4-1/4-2. Wood is a highly anisotropic, non-ductile material — the same "no formula, genuine gap" category as granite/sapphire in this project\'s COR Methodology — so HV is left null and the validated Stronge/Johnson ductile model is never applied. restitutionEstimate is a density-based interpolation (0.55 base at SG 0.55, +-0.5 x (SG-0.55), clamped 0.35-0.65): denser, stiffer species are assumed to lose relatively less energy to crushing on impact than lighter, softer ones, consistent with the Handbook\'s own per-species impact-bending (drop-height-to-failure) figures trending the same direction with density. frictionEstimate (0.4) is anchored on real CRC Handbook of Chemistry and Physics oak-on-oak dry sliding friction (0.48 parallel-to-grain, 0.32 perpendicular — the two directly measured wood-wood values in this project\'s sources), averaged since this app does not model grain orientation; the oak entries themselves use the measured 0.48 directly via CRC_FRICTION rather than the estimate. Janka side hardness (a different, non-Vickers indentation scale) is recorded in the reference workbook per species but not used here, since it isn\'t Tabor-convertible to the Vickers-equivalent Y this app\'s formula needs.',
    verified: true,
  },
  strongeJohnsonModel: {
    short: 'computed: Stronge/Johnson elastic-plastic yield model',
    full: 'Self-coefficient-of-restitution is computed per material from density, elastic modulus, Poisson\'s ratio, and Tabor-derived yield stress (Y = HV x 9.80665/3), using the closed-form yield-onset velocity relation rho*v_Y^2/Y = 29.55*(Y/E*)^4 and e* = (v_Y/v)^(1/4) above it (W.J. Stronge, Impact Mechanics, 2nd ed., Cambridge 2018; cross-confirmed against K.L. Johnson, Contact Mechanics, 1985, eq. 11.39/11.44). Validated against Stronge\'s own Table 6.1 measured yield velocities for mild steel, brass, and two aluminum alloys (same order of magnitude, 20%-3x). Object-on-surface composite restitution uses the energetic composite-COR formula (Coaplen, Stronge & Ravani, Int. J. Impact Eng. 30(6), 2004), weighted by each material\'s yield stress.',
    verified: true,
  },
  crcFriction: {
    short: 'CRC Handbook of Chemistry and Physics, measured dry sliding friction',
    full: 'CRC Handbook of Chemistry and Physics, Internet Edition — real measured dry (unlubricated), room-temperature sliding-friction values for this exact or a closely analogous object/surface pair (mild steel used as the iron-surface proxy).',
    verified: true,
  },
  frictionFallback: {
    short: 'hardness-ranked friction estimate (no direct CRC measurement)',
    full: 'No direct or closely analogous CRC-measured friction value exists for this object/surface pair. Falls back to mu = 0.60 - 0.45 x normalized log10(hardness), spanning this roster\'s Vickers-hardness range (3.9-225 HV) — a weaker, ranking-based estimate rather than a measured figure.',
    verified: false,
  },
  none: { short: 'user-defined', full: 'No literature reference — set directly by the user.', verified: false },
  opticsReflectance: {
    short: 'computed: Fresnel reflectance from measured optical constants (refractiveindex.info)',
    full: 'color lightness (the L channel in HSL; hue/saturation are still a visual match to the material\'s known appearance) is computed from real, published complex refractive index data n,k at 550nm via the normal-incidence Fresnel reflectance R = ((n-1)^2+k^2)/((n+1)^2+k^2), L = R. Sources, all via the refractiveindex.info-hosted public-domain database: titanium/iron/copper/chromium/nickel/vanadium — P.B. Johnson & R.W. Christy, Phys. Rev. B 6, 4370 (1972) [Cu] and Phys. Rev. B 9, 5056 (1974) [Ti,V,Cr,Fe,Ni]; aluminum — A.D. Rakic, Appl. Opt. 34, 4755 (1995); zinc — W.S.M. Werner, K. Glantschnig, C. Ambrosch-Draxl, J. Phys. Chem. Ref. Data 38, 1013 (2009); zirconium — M.R. Querry, "Optical Constants" report, CRDEC-CR-88009 (1985); niobium — A.I. Golovashkin et al., Sov. Phys. JETP (1969 dataset); graphite (carbon) — H.-J. Hagemann, W. Gudat, C. Kunz, J. Opt. Soc. Am. 65, 742 (1975). Non-metals use the closest available real diffuse-reflectance/transmittance figure as an L proxy rather than a matched physical quantity, flagged per-entry: PTFE ~99% diffuse reflectance (it is the basis for Spectralon calibration standards; Labsphere technical guide); PMMA ~92% clear-sheet transmittance (Plexiglas/Rohm datasheet); sapphire ~85% (midpoint of 80-90% visible transmittance range cited across manufacturer sapphire-window datasheets); granite ~60% albedo (a single general geological-albedo reference — lower confidence than the others here, no per-composition figure was found). Deliberately NOT applied to tungsten, lead, molybdenum, magnesium, bismuth, tin, antimony, cast iron, or nylon: the first five have real optical data but it describes an optically clean, mirror-polished surface, which for these particular metals diverges sharply from the dull/oxidized look a bulk object actually has (e.g. tungsten and lead read as dark in practice despite a clean film reflecting >80%); tin and antimony have no visible-range n,k data in this database; cast iron is an alloy plus graphite flakes with no clean elemental analog; nylon 6,6 had no citable reflectance figure anywhere searched. Those nine keep their original hand-matched color unchanged.',
    verified: true,
  },
};

// Unified material catalog — every material this app knows about, whether it
// can be dropped as an object, used as a surface, or both, matching the
// project reference workbook's own "Role in Project" column (Object / Object
// & Surface). Adding a future surface-only material (tile, ceramics, concrete,
// fabric, paper, ...) is just a new entry here with roles: ['surface'] — no
// separate surface table to keep in sync.
//
// density kg/m3, E (tension) Pa, nu = Poisson's ratio, HV = Vickers-equivalent
// hardness (null/omitted = no formula-usable hardness for this material, either
// because none was found (graphite) or because it's a brittle ceramic/rock or
// polymer outside the validated ductile model's range (granite, PMMA, sapphire,
// nylon, PTFE) — see restitutionEstimate/frictionEstimate below and
// SOURCES.graphiteEstimate / SOURCES.expandedRosterEMHCardarelli). sourceRef
// points into SOURCES above. roughness is this material's default surface
// bump-scale when used as a surface (visual/physical, no literature source);
// only meaningful for roles including 'surface'. color's hue/saturation are
// still a hand-eyeballed match to the material's known real-world appearance;
// where a colorRef is present, its lightness is instead computed from real
// data (see SOURCES.opticsReflectance) — everything else keeps a hand-matched
// lightness too.
const MATERIAL_LIBRARY = {
  tungsten:   { label: 'Tungsten (W)',      density: 19250, E: 400e9,   nu: 0.28, HV: 385,  color: '#4a4a4a', metal: true,  sourceRef: 'asmRefractory',      roles: ['object', 'surface'], roughness: 0.15 },
  titanium:   { label: 'Titanium (Ti)',     density: 4500,  E: 105e9,   nu: 0.34, HV: 150,  color: '#929497', metal: true,  sourceRef: 'hardnessEstimate',   colorRef: 'opticsReflectance', roles: ['object', 'surface'], roughness: 0.15 },
  bismuth:    { label: 'Bismuth (Bi)',      density: 9808,  E: 32e9,    nu: 0.33, HV: 7,    color: '#b98c7a', metal: true,  sourceRef: 'asmPureMetals',      roles: ['object', 'surface'], roughness: 0.2 },
  carbon:     { label: 'Carbon (graphite)', density: 2200,  E: 11e9,    nu: 0.20, HV: null, color: '#242424', metal: false, sourceRef: 'graphiteEstimate',   colorRef: 'opticsReflectance', roles: ['object', 'surface'], roughness: 0.1, restitutionEstimate: 0.22, frictionEstimate: 0.3 },
  aluminum:   { label: 'Aluminum (Al)',     density: 2700,  E: 69e9,    nu: 0.33, HV: 23,   color: '#e9e9e9', metal: true,  sourceRef: 'asmAlloySupplement', colorRef: 'opticsReflectance', roles: ['object', 'surface'], roughness: 0.15 },
  iron:       { label: 'Iron (Fe)',         density: 7870,  E: 205e9,   nu: 0.28, HV: 90,   color: '#808185', metal: true,  sourceRef: 'asmVol1Iron',        colorRef: 'opticsReflectance', roles: ['object', 'surface'], roughness: 0.15 },
  copper:     { label: 'Copper (Cu)',       density: 8930,  E: 128e9,   nu: 0.34, HV: 60,   color: '#e59b5a', metal: true,  sourceRef: 'asmAlloySupplement', colorRef: 'opticsReflectance', roles: ['object', 'surface'], roughness: 0.15 },
  lead:       { label: 'Lead (Pb)',         density: 11350, E: 16e9,    nu: 0.44, HV: 4.5,  color: '#5c5c66', metal: true,  sourceRef: 'asmAlloySupplement', roles: ['object', 'surface'], roughness: 0.2 },
  zinc:       { label: 'Zinc (Zn)',         density: 7140,  E: 90e9,    nu: 0.25, HV: 42,   color: '#d6e0e5', metal: true,  sourceRef: 'asmAlloySupplement', colorRef: 'opticsReflectance', roles: ['object', 'surface'], roughness: 0.15 },
  vanadium:   { label: 'Vanadium (V)',      density: 6160,  E: 130.5e9, nu: 0.36, HV: 72,   color: '#7a8796', metal: true,  sourceRef: 'asmPureMetals',      colorRef: 'opticsReflectance', roles: ['object', 'surface'], roughness: 0.15 },
  chromium:   { label: 'Chromium (Cr)',     density: 7190,  E: 248e9,   nu: 0.21, HV: 125,  color: '#888e93', metal: true,  sourceRef: 'asmPureMetals',      colorRef: 'opticsReflectance', roles: ['object', 'surface'], roughness: 0.12 },
  nickel:     { label: 'Nickel (Ni)',       density: 8902,  E: 207e9,   nu: 0.31, HV: 64,   color: '#afaf99', metal: true,  sourceRef: 'asmPureMetals',      colorRef: 'opticsReflectance', roles: ['object', 'surface'], roughness: 0.15 },
  tin:        { label: 'Tin (Sn)',          density: 7170,  E: 41.6e9,  nu: 0.33, HV: 3.9,  color: '#d9d9d9', metal: true,  sourceRef: 'asmPureMetals',      roles: ['object', 'surface'], roughness: 0.15 },
  antimony:   { label: 'Antimony (Sb)',     density: 6697,  E: 77.8e9,  nu: 0.33, HV: 44,   color: '#a8a8a8', metal: true,  sourceRef: 'asmPureMetals',      roles: ['object', 'surface'], roughness: 0.2 },
  zirconium:  { label: 'Zirconium (Zr)',    density: 6500,  E: 99.3e9,  nu: 0.35, HV: 225,  color: '#9a9a8b', metal: true,  sourceRef: 'hardnessEstimate',   colorRef: 'opticsReflectance', roles: ['object', 'surface'], roughness: 0.15 },
  niobium:    { label: 'Niobium (Nb)',      density: 8570,  E: 103e9,   nu: 0.38, HV: 78,   color: '#8f8f8f', metal: true,  sourceRef: 'hardnessEstimate',   colorRef: 'opticsReflectance', roles: ['object', 'surface'], roughness: 0.15 },
  molybdenum: { label: 'Molybdenum (Mo)',   density: 10220, E: 325e9,   nu: 0.32, HV: 210,  color: '#909090', metal: true,  sourceRef: 'asmRefractory',      roles: ['object', 'surface'], roughness: 0.15 },
  magnesium:  { label: 'Magnesium (Mg)',    density: 1738,  E: 45e9,    nu: 0.35, HV: 30,   color: '#c4c4b8', metal: true,  sourceRef: 'asmAlloySupplement', roles: ['object', 'surface'], roughness: 0.18 },

  // Promoted from the reference workbook's "Provisional Materials" / "Additional
  // Candidate Materials" staging sheets into its main Material Properties list
  // (their "(proposed)" role tag was dropped there to match). Cast iron has a
  // real ductile phase, so it runs through the same validated formula as the 18
  // elements above; the other five are brittle ceramics/rock or polymers
  // outside that model's range, so HV is left null and their restitution/
  // friction fall back to a flagged literature-informed estimate — see
  // SOURCES.expandedRosterEMHCardarelli / SOURCES.castIronValidated.
  castIron: { label: 'Cast Iron (gray)',        density: 7400, E: 124e9, nu: 0.25,  HV: 235,  color: '#3b3b3d', metal: true,  sourceRef: 'castIronValidated',           roles: ['object', 'surface'], roughness: 0.2 },
  granite:  { label: 'Granite',                 density: 2700, E: 55e9,  nu: null,  HV: null, color: '#a19b91', metal: false, sourceRef: 'expandedRosterEMHCardarelli', colorRef: 'opticsReflectance', roles: ['object', 'surface'], roughness: 0.35, restitutionEstimate: 0.75, frictionEstimate: 0.5 },
  pmma:     { label: 'PMMA (Acrylic)',          density: 1185, E: 3.06e9, nu: null, HV: null, color: '#e4eff1', metal: false, sourceRef: 'expandedRosterEMHCardarelli', colorRef: 'opticsReflectance', roles: ['object', 'surface'], roughness: 0.05, restitutionEstimate: 0.6, frictionEstimate: 0.35 },
  sapphire: { label: 'Sapphire / Alumina (Corundum)', density: 3975, E: 398e9, nu: 0.24, HV: null, color: '#e5dccc', metal: false, sourceRef: 'expandedRosterEMHCardarelli', colorRef: 'opticsReflectance', roles: ['object', 'surface'], roughness: 0.05, restitutionEstimate: 0.85, frictionEstimate: 0.2 },
  nylon:    { label: 'Nylon 6,6',               density: 1140, E: 3.3e9, nu: 0.43,  HV: null, color: '#e3d9c6', metal: false, sourceRef: 'expandedRosterEMHCardarelli', roles: ['object', 'surface'], roughness: 0.1, restitutionEstimate: 0.45, frictionEstimate: 0.3 },
  ptfe:     { label: 'PTFE (Teflon)',           density: 2215, E: 0.62e9, nu: null, HV: null, color: '#fdfdfc', metal: false, sourceRef: 'expandedRosterEMHCardarelli', colorRef: 'opticsReflectance', roles: ['object', 'surface'], roughness: 0.05, restitutionEstimate: 0.2, frictionEstimate: 0.05 },

  // 18 named wood species (16 hardwood/softwood species plus White Oak and
  // Northern Red Oak) — USDA Wood Handbook, Table 4-3a, 12% MC. density is
  // specific gravity x 1000; E is parallel-to-grain static bending MOE. Wood
  // is anisotropic and non-ductile (HV left null, same "no formula" category
  // as granite/sapphire — see SOURCES.usdaWoodHandbook), so restitutionEstimate
  // is a density-based interpolation and frictionEstimate is anchored on real
  // CRC oak-on-oak sliding friction; the two oak entries additionally get a
  // direct CRC_FRICTION self-pair entry instead of relying on the estimate.
  ashWhite:        { label: 'Ash, white',              density: 600,  E: 12e9,   nu: null, HV: null, color: '#d8c9a3', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.58, frictionEstimate: 0.4 },
  beechAmerican:   { label: 'Beech, American',         density: 640,  E: 11.9e9, nu: null, HV: null, color: '#e8d4a0', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.60, frictionEstimate: 0.4 },
  birchYellow:     { label: 'Birch, yellow',           density: 620,  E: 13.9e9, nu: null, HV: null, color: '#e6c78c', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.59, frictionEstimate: 0.4 },
  cherryBlack:     { label: 'Cherry, black',           density: 500,  E: 10.3e9, nu: null, HV: null, color: '#7a3b2e', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.53, frictionEstimate: 0.4 },
  hickoryShagbark: { label: 'Hickory, shagbark',       density: 720,  E: 14.9e9, nu: null, HV: null, color: '#c9a066', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.64, frictionEstimate: 0.4 },
  mapleSugar:      { label: 'Maple, sugar',            density: 630,  E: 12.6e9, nu: null, HV: null, color: '#e8d9b5', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.59, frictionEstimate: 0.4 },
  mapleRed:        { label: 'Maple, red',              density: 540,  E: 11.3e9, nu: null, HV: null, color: '#d9b98a', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.55, frictionEstimate: 0.4 },
  walnutBlack:     { label: 'Walnut, black',           density: 550,  E: 11.6e9, nu: null, HV: null, color: '#5a3a29', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.55, frictionEstimate: 0.4 },
  yellowPoplar:    { label: 'Yellow-poplar',           density: 420,  E: 10.9e9, nu: null, HV: null, color: '#cbb98a', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.49, frictionEstimate: 0.4 },
  douglasFirCoast: { label: 'Douglas-fir, Coast',      density: 480,  E: 13.4e9, nu: null, HV: null, color: '#c08a52', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.52, frictionEstimate: 0.4 },
  pineLoblolly:    { label: 'Pine, loblolly',          density: 510,  E: 12.3e9, nu: null, HV: null, color: '#d9a96b', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.53, frictionEstimate: 0.4 },
  pineLongleaf:    { label: 'Pine, longleaf',          density: 590,  E: 13.7e9, nu: null, HV: null, color: '#c99a5c', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.57, frictionEstimate: 0.4 },
  pinePonderosa:   { label: 'Pine, ponderosa',         density: 400,  E: 8.9e9,  nu: null, HV: null, color: '#e0b784', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.48, frictionEstimate: 0.4 },
  spruceSitka:     { label: 'Spruce, Sitka',           density: 360,  E: 9.9e9,  nu: null, HV: null, color: '#e8dcc0', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.46, frictionEstimate: 0.4 },
  redwoodOldGrowth:{ label: 'Redwood, old-growth',     density: 400,  E: 9.2e9,  nu: null, HV: null, color: '#8b4535', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.48, frictionEstimate: 0.4 },
  cedarWesternRed: { label: 'Cedar, western red',      density: 320,  E: 7.7e9,  nu: null, HV: null, color: '#a85c3a', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.44, frictionEstimate: 0.4 },
  oakWhite:        { label: 'Oak, white',              density: 680,  E: 12.3e9, nu: null, HV: null, color: '#c8a672', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.62, frictionEstimate: 0.4 },
  oakNorthernRed:  { label: 'Oak, northern red',       density: 630,  E: 12.5e9, nu: null, HV: null, color: '#b8875a', metal: false, sourceRef: 'usdaWoodHandbook', roles: ['object', 'surface'], roughness: 0.22, restitutionEstimate: 0.59, frictionEstimate: 0.4 },
};

const OBJECT_MATERIAL_KEYS = Object.keys(MATERIAL_LIBRARY).filter((k) => MATERIAL_LIBRARY[k].roles.includes('object'));
const SURFACE_MATERIAL_KEYS = Object.keys(MATERIAL_LIBRARY).filter((k) => MATERIAL_LIBRARY[k].roles.includes('surface'));

const CUSTOM_MATERIAL = {
  label: 'Custom (Hrifa material)', density: 2000, restitution: 0.4, friction: 0.4, color: '#5aa9e6', metal: false, custom: true,
};

const MATERIALS = {};
OBJECT_MATERIAL_KEYS.forEach((k) => { MATERIALS[k] = MATERIAL_LIBRARY[k]; });
MATERIALS.custom = CUSTOM_MATERIAL;

// ---------- Impact physics: self-COR, composite COR, friction ----------
// See SOURCES.strongeJohnsonModel / SOURCES.crcFriction / SOURCES.frictionFallback.

const G = 9.82; // matches world gravity magnitude used below
const DEFAULT_RESTITUTION_ESTIMATE = 0.3; // safety-net only — every current HV-less material sets its own restitutionEstimate
const DEFAULT_FRICTION_ESTIMATE = 0.3; // safety-net only — every current HV-less material sets its own frictionEstimate

function yieldStressPa(HV) {
  return (HV * 9.80665 / 3) * 1e6; // Tabor: Y = HV / 3, HV in kgf/mm^2 -> MPa -> Pa
}

// Self-coefficient-of-restitution of a material dropped on itself, as a
// function of actual impact speed (m/s). Below the yield-onset velocity v_Y,
// impact is effectively elastic (e~1); above it, e falls off as (v_Y/v)^(1/4).
// Returns null for a material with no HV (outside this model's validated
// ductile-metal range) — the caller falls back to that material's own
// restitutionEstimate (see compositeCOR).
function selfCOR(mat, impactSpeed) {
  if (!mat.HV) return null;
  const Y = yieldStressPa(mat.HV);
  const Estar = mat.E / (2 * (1 - mat.nu * mat.nu));
  const vY = Math.sqrt((29.55 * Y * Math.pow(Y / Estar, 4)) / mat.density);
  if (impactSpeed <= vY) return 1;
  return Math.min(1, Math.pow(vY / impactSpeed, 0.25));
}

// Energetic composite COR for an object of material A landing on a surface of
// material B (Coaplen, Stronge & Ravani 2004): e^2 = (e1^2/k1 + e2^2/k2) /
// (1/k1 + 1/k2), with contact stiffness k_i ~ Y_i in the fully-plastic regime
// this project's impact speeds always fall in. If either material has no HV
// (e.g. graphite, or a future fabric/paper surface), its own flagged
// restitutionEstimate stands in for that side instead of the formula.
function compositeCOR(matA, matB, impactSpeed) {
  const eA = selfCOR(matA, impactSpeed);
  const eB = selfCOR(matB, impactSpeed);
  const fallbackA = matA.restitutionEstimate ?? DEFAULT_RESTITUTION_ESTIMATE;
  const fallbackB = matB.restitutionEstimate ?? DEFAULT_RESTITUTION_ESTIMATE;
  if (eA == null && eB == null) return clamp01((fallbackA + fallbackB) / 2);
  if (eA == null) return clamp01((fallbackA + eB) / 2);
  if (eB == null) return clamp01((fallbackB + eA) / 2);
  const YA = matA.HV, YB = matB.HV; // ratio-only — any consistent unit works
  return Math.sqrt((eA * eA / YA + eB * eB / YB) / (1 / YA + 1 / YB));
}

// Real measured dry-sliding friction (CRC Handbook of Chemistry and Physics),
// keyed 'objectKey|surfaceKey' (iron surface = mild-steel proxy throughout).
const CRC_FRICTION = {
  'aluminum|aluminum': 1.4,
  'aluminum|iron': 0.47,
  'copper|copper': 1.6,
  'copper|iron': 0.36,
  'nickel|nickel': 0.53,
  'nickel|iron': 0.64,
  'zinc|iron': 0.21,
  'tin|iron': 0.32,
  'lead|iron': 0.95,
  'iron|iron': 0.57,
  'tungsten|iron': 0.5,
  'castIron|castIron': 0.15,
  'nylon|nylon': 0.2,
  'nylon|iron': 0.4,
  'ptfe|ptfe': 0.04,
  'ptfe|iron': 0.04,
  'sapphire|sapphire': 0.2,
  // Real measured oak-on-oak dry sliding friction (CRC), parallel-to-grain
  // value (0.48); perpendicular-to-grain (0.32) and both static figures
  // (0.62/0.54) are documented in SOURCES.usdaWoodHandbook but not modeled
  // separately since this app doesn't track grain orientation. CRC doesn't
  // distinguish oak species, so the same measurement applies to both.
  'oakWhite|oakWhite': 0.48,
  'oakNorthernRed|oakNorthernRed': 0.48,
  'oakWhite|oakNorthernRed': 0.48,
  'oakNorthernRed|oakWhite': 0.48,
};
const FRICTION_HV_MIN = 3.9, FRICTION_HV_MAX = 225; // this roster's Vickers-hardness range (tin .. zirconium estimate)

function frictionFallback(objMat) {
  if (!objMat.HV) return objMat.frictionEstimate ?? DEFAULT_FRICTION_ESTIMATE;
  const t = clamp01((Math.log10(objMat.HV) - Math.log10(FRICTION_HV_MIN)) / (Math.log10(FRICTION_HV_MAX) - Math.log10(FRICTION_HV_MIN)));
  return 0.6 - 0.45 * t;
}

function frictionFor(objKey, surfKey, objMat) {
  const direct = CRC_FRICTION[`${objKey}|${surfKey}`];
  return direct !== undefined ? direct : frictionFallback(objMat);
}

// Single source of truth for (object material key, surface material key, drop
// height in meters) -> {restitution, friction}. Used by both the live info
// panel and the actual physics body at drop time, so what's shown before
// dropping is exactly what gets simulated.
function resolvePairPhysics(objKey, surfKey, dropHeightM) {
  const objMat = MATERIAL_LIBRARY[objKey];
  const surfMat = MATERIAL_LIBRARY[surfKey];
  const impactSpeed = Math.sqrt(2 * G * Math.max(0, dropHeightM));
  const restitution = compositeCOR(objMat, surfMat, impactSpeed);
  const friction = frictionFor(objKey, surfKey, objMat);
  return { restitution, friction };
}

// Listed in this order so "Cube" is the default selection (populateSelects
// appends options in insertion order, and <select> defaults to the first) —
// matches the project's actual 20mm-cube drop simulation. "Target size" means
// edge length for Cube, long-axis length for the 2:1 prism, diameter for
// Sphere/Ovoid, and circumdiameter for the Platonic/Archimedean/Catalan/
// Johnson solids. `group` drives the <optgroup> the shape select is split
// into (see populateSelects) — needed once the Archimedean/Catalan/Johnson
// sets (118 more shapes, see POLYHEDRA_DATA below) turn this from 9 options
// into ~127.
const PRIMITIVE_SHAPES = {
  cube: { label: 'Cube', group: 'Basic' },
  sphere: { label: 'Sphere', group: 'Basic' },
  rect2to1: { label: 'Rectangular prism (2:1)', group: 'Basic' },
  ovoid: { label: 'Ovoid (ellipsoid)', group: 'Basic' },
  cylinder: { label: 'Cylinder (coin/disc)', group: 'Basic' },
  tetrahedron: { label: 'Tetrahedron', group: 'Platonic solids' },
  octahedron: { label: 'Octahedron', group: 'Platonic solids' },
  dodecahedron: { label: 'Dodecahedron', group: 'Platonic solids' },
  icosahedron: { label: 'Icosahedron', group: 'Platonic solids' },
};

// Populated at boot from polyhedra-data.json (fetched alongside RAPIER.init()
// — see boot()) — 8 prisms, 8 antiprisms, 13 Archimedean solids, 13 Catalan
// solids (the polar dual of each Archimedean solid — this project computed
// those itself since the source dataset has no Catalan category), and all 92
// Johnson solids (134 shapes total). Source: github.com/finnp/polyhedra
// (derived from George Hart's "Virtual Polyhedra" data). Flat map keyed by
// shape id -> { label, group, vertices }; vertices are pre-normalized
// (recentered on centroid, scaled so circumradius = 0.5) so every entry can
// share the exact same s/2 circumradius convention as the hardcoded Platonic
// solids above — see buildPrimitiveGeometryAndShape() and
// estimateBoundingRadius(). Stays {} (shapes just don't appear) if the fetch
// fails, so a missing file can't crash the app.
const POLYHEDRA_DATA = {};
const POLYHEDRA_GROUP_LABELS = {
  prisms: 'Prisms',
  antiprisms: 'Antiprisms',
  archimedean: 'Archimedean solids',
  catalan: 'Catalan solids',
  johnson: 'Johnson solids',
};

async function loadPolyhedraData() {
  try {
    const res = await fetch('./polyhedra-data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    Object.entries(POLYHEDRA_GROUP_LABELS).forEach(([source, groupLabel]) => {
      Object.entries(data[source] || {}).forEach(([key, entry]) => {
        POLYHEDRA_DATA[key] = { label: entry.label, group: groupLabel, vertices: entry.vertices };
      });
    });
  } catch (err) {
    console.warn('polyhedra-data.json failed to load — Archimedean/Catalan/Johnson shapes will be unavailable.', err);
  }
}

// Ovoid is approximated as a smooth prolate-spheroid ellipsoid (taller than
// wide), not a true asymmetric egg curve with one blunter end — flagged here
// since both the geometry and the bounding-radius estimate below depend on it.
const OVOID_RX_FACTOR = 0.4;
const OVOID_RY_FACTOR = 0.575;
const OVOID_RZ_FACTOR = 0.4;

// Lightens a '#rrggbb' color toward white by `amount` (0-1) — used to derive a
// surface's canvas-texture accent tint from its own material color, so a new
// surface material (tile, ceramics, concrete, fabric, paper, ...) doesn't need
// a hand-picked accent color, just an entry in MATERIAL_LIBRARY.
function lightenColor(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

// Every material with role 'surface' in MATERIAL_LIBRARY, ready to drop onto.
// Friction and restitution are NOT stored here: they depend on the (object,
// surface, drop height) triple and are computed by resolvePairPhysics().
const SURFACE_PRESETS = {};
SURFACE_MATERIAL_KEYS.forEach((key) => {
  const mat = MATERIAL_LIBRARY[key];
  SURFACE_PRESETS[key] = {
    label: mat.label,
    materialKey: key,
    roughness: mat.roughness ?? 0.15,
    base: mat.color,
    accent: lightenColor(mat.color, 0.2),
  };
});

const TEXTURE_MULT = {
  smooth: { friction: 0.75, roughness: 0.4 },
  rough: { friction: 1.25, roughness: 1.6 },
};

let scene, camera, renderer, controls, sceneContainerEl;
let groundMesh, groundTexture, heatmapCanvas, heatCtx;
let world, groundBody;

let surfaceSelect, textureSelect, surfaceInfoEl, surfaceFrictionEl, surfaceRestitutionEl, angleSlider, angleValue, heightSlider, heightValue, speedSlider, speedValue, colsInput, rowsInput;
let fpsCounterEl;
let shapeSelect, sizeSlider, sizeValue, meshUpload, uploadStatusEl;
let materialSelect, materialInfoEl, materialDensityEl, materialRestitutionEl, materialFrictionEl, customPropsEl, densitySlider, densityValue, hardnessSlider, hardnessValue, frictionSlider, frictionValue;
let countInput, addItemBtn, batchListEl;
let dropBtn, resetBtn, copyBtn, exportBtn, statusEl, resultsSummaryEl, resultsGridEl;

const customShapes = {};
let batch = [];
let lastRoundConfig = null; // snapshot of surface/texture/tilt/height/batch at the moment a round was dropped
let activeObjects = []; // { body, group, instanceId, scale, settled, offSurface, stableFrames }
let previewObjects = []; // { itemDef, x, y, z } — the pre-drop "in hand" arrangement
let previewGroups = []; // InstancedMesh objects backing previewObjects
let currentSlopeAngle = 0;
let currentSubsteps = MIN_SUBSTEPS;
let roundMinRadius = 0.02; // smallest item's bounding radius for the active round
let running = false;
let roundSimSeconds = 0; // simulated (not wall-clock) time elapsed in the current round
let lastResult = null;

boot();

async function boot() {
  try {
    // Run in parallel — the polyhedra fetch is a small local file and
    // shouldn't gate RAPIER's (much slower) WASM init.
    await Promise.all([RAPIER.init(), loadPolyhedraData()]);
    init();
  } catch (err) {
    const box = document.createElement('div');
    box.id = '__booterr';
    box.style.cssText = 'position:fixed;top:0;left:0;background:red;color:white;z-index:99999;font-size:14px;padding:8px;white-space:pre-wrap;max-width:100vw;';
    box.textContent = String((err && err.stack) || err);
    document.body.appendChild(box);
  }
}

function init() {
  wireDom();
  populateSelects();
  setupScene();
  setupPhysicsWorld(getSurface(), currentAngleRad());
  drawGroundTexture();
  updateSurfaceInfo();
  updateMaterialInfo();
  updateAdvancedLabels();
  renderBatchList();
  dropBtn.disabled = true;
  requestAnimationFrame(animate);
}

function wireDom() {
  surfaceSelect = document.getElementById('surfaceSelect');
  textureSelect = document.getElementById('textureSelect');
  surfaceInfoEl = document.getElementById('surfaceInfo');
  surfaceFrictionEl = document.getElementById('surfaceFriction');
  surfaceRestitutionEl = document.getElementById('surfaceRestitution');
  angleSlider = document.getElementById('angleSlider');
  angleValue = document.getElementById('angleValue');
  heightSlider = document.getElementById('heightSlider');
  heightValue = document.getElementById('heightValue');
  speedSlider = document.getElementById('speedSlider');
  speedValue = document.getElementById('speedValue');
  colsInput = document.getElementById('colsInput');
  rowsInput = document.getElementById('rowsInput');
  fpsCounterEl = document.getElementById('fpsCounter');

  shapeSelect = document.getElementById('shapeSelect');
  sizeSlider = document.getElementById('sizeSlider');
  sizeValue = document.getElementById('sizeValue');
  meshUpload = document.getElementById('meshUpload');
  uploadStatusEl = document.getElementById('uploadStatus');

  materialSelect = document.getElementById('materialSelect');
  materialInfoEl = document.getElementById('materialInfo');
  materialDensityEl = document.getElementById('materialDensity');
  materialRestitutionEl = document.getElementById('materialRestitution');
  materialFrictionEl = document.getElementById('materialFriction');
  customPropsEl = document.getElementById('customMaterialProps');
  densitySlider = document.getElementById('densitySlider');
  densityValue = document.getElementById('densityValue');
  hardnessSlider = document.getElementById('hardnessSlider');
  hardnessValue = document.getElementById('hardnessValue');
  frictionSlider = document.getElementById('frictionSlider');
  frictionValue = document.getElementById('frictionValue');

  countInput = document.getElementById('countInput');
  addItemBtn = document.getElementById('addItemBtn');
  batchListEl = document.getElementById('batchList');

  dropBtn = document.getElementById('dropBtn');
  resetBtn = document.getElementById('resetBtn');
  copyBtn = document.getElementById('copyBtn');
  exportBtn = document.getElementById('exportBtn');
  statusEl = document.getElementById('status');
  resultsSummaryEl = document.getElementById('resultsSummary');
  resultsGridEl = document.getElementById('resultsGrid');

  angleSlider.addEventListener('input', () => {
    angleValue.textContent = `${angleSlider.value}°`;
    updateGroundVisualTilt(currentAngleRad());
  });
  heightSlider.addEventListener('input', () => {
    heightValue.textContent = `${parseFloat(heightSlider.value).toFixed(1)} m`;
    updatePreview();
    updateMaterialInfo();
  });
  speedSlider.addEventListener('input', () => {
    speedValue.textContent = `${parseFloat(speedSlider.value).toFixed(1)}×`;
  });
  sizeSlider.addEventListener('input', () => {
    sizeValue.textContent = `${parseFloat(sizeSlider.value).toFixed(2)} m`;
  });
  surfaceSelect.addEventListener('change', drawGroundTexture);
  textureSelect.addEventListener('change', drawGroundTexture);
  surfaceSelect.addEventListener('change', updateSurfaceInfo);
  textureSelect.addEventListener('change', updateSurfaceInfo);
  surfaceSelect.addEventListener('change', updateMaterialInfo);
  textureSelect.addEventListener('change', updateMaterialInfo);
  colsInput.addEventListener('change', drawGroundTexture);
  rowsInput.addEventListener('change', drawGroundTexture);

  materialSelect.addEventListener('change', updateMaterialInfo);
  [densitySlider, hardnessSlider, frictionSlider].forEach((el) => {
    el.addEventListener('input', () => {
      updateAdvancedLabels();
      updateMaterialInfo();
    });
  });

  meshUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleMeshUpload(file);
  });

  addItemBtn.addEventListener('click', addBatchItem);
  dropBtn.addEventListener('click', dropAll);
  resetBtn.addEventListener('click', resetAll);
  copyBtn.addEventListener('click', copyResults);
  exportBtn.addEventListener('click', exportResultsJson);

  window.addEventListener('keydown', handleHotkey);
}

// D drops, R resets — ignored while typing in a field, and no modifiers so
// browser/OS shortcuts (Ctrl+R, Cmd+D, ...) still work as expected.
function handleHotkey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const key = e.key.toLowerCase();
  if (key === 'd' && !dropBtn.disabled) {
    e.preventDefault();
    dropAll();
  } else if (key === 'r') {
    e.preventDefault();
    resetAll();
  }
}

function populateSelects() {
  Object.entries(SURFACE_PRESETS).forEach(([key, preset]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = preset.label;
    surfaceSelect.appendChild(opt);
  });

  populateShapeSelect();

  Object.entries(MATERIALS).forEach(([key, preset]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = preset.label;
    materialSelect.appendChild(opt);
  });
}

// Builds the shape <select> as a series of <optgroup>s rather than one flat
// list — going from 9 shapes to ~127 (9 basic/Platonic + 13 Archimedean + 13
// Catalan + 92 Johnson) makes a flat list unusable. PRIMITIVE_SHAPES supplies
// "Basic"/"Platonic solids"; POLYHEDRA_DATA (fetched at boot, may be empty if
// that fetch failed) supplies the other three groups. Group order here is the
// display order.
function populateShapeSelect() {
  const groupOrder = ['Basic', 'Platonic solids', 'Prisms', 'Antiprisms', 'Archimedean solids', 'Catalan solids', 'Johnson solids'];
  const byGroup = {};
  groupOrder.forEach((g) => { byGroup[g] = []; });

  Object.entries(PRIMITIVE_SHAPES).forEach(([key, preset]) => {
    byGroup[preset.group].push({ key, label: preset.label });
  });
  Object.entries(POLYHEDRA_DATA).forEach(([key, entry]) => {
    byGroup[entry.group].push({ key, label: entry.label });
  });

  groupOrder.forEach((groupLabel) => {
    const entries = byGroup[groupLabel];
    if (entries.length === 0) return; // e.g. Archimedean/Catalan/Johnson if the fetch failed
    const optgroup = document.createElement('optgroup');
    optgroup.label = groupLabel;
    entries.forEach(({ key, label }) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      optgroup.appendChild(opt);
    });
    shapeSelect.appendChild(optgroup);
  });
}

function currentAngleRad() {
  return (parseFloat(angleSlider.value) || 0) * (Math.PI / 180);
}

function getSurface() {
  const preset = SURFACE_PRESETS[surfaceSelect.value];
  const mult = TEXTURE_MULT[textureSelect.value];
  return {
    ...preset,
    roughness: preset.roughness * mult.roughness,
    frictionMult: mult.friction, // applied to the computed pair friction, not stored on the preset
  };
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function clampInt(val, min, max, fallback) {
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ---------- Three.js scene ----------

function setupScene() {
  sceneContainerEl = document.getElementById('sceneContainer');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0d10);

  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(0, 1.8, 1.9);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  sceneContainerEl.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.minDistance = 0.4;
  controls.maxDistance = 6;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
  dirLight.position.set(1.5, 3, 1.2);
  scene.add(dirLight);

  heatmapCanvas = document.createElement('canvas');
  heatmapCanvas.width = 512;
  heatmapCanvas.height = 512;
  heatCtx = heatmapCanvas.getContext('2d');
  groundTexture = new THREE.CanvasTexture(heatmapCanvas);

  const groundGeom = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
  groundGeom.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  groundMesh = new THREE.Mesh(groundGeom, groundMat);
  scene.add(groundMesh);

  resizeStage();
  window.addEventListener('resize', resizeStage);
}

// Keeps the canvas a perfect square sized to fill the stage panel's available
// space, capped by WHICHEVER of width/height is smaller — not just height.
// The stage's own clientWidth already reflects the CSS grid's minmax(280px, 1fr)
// middle column (see styles.css), so this can't grow past what's actually left
// after the two 250px/300px side panels — that's what previously caused a
// horizontal scrollbar on wide-but-short-content windows, since the square was
// sized purely from clientHeight and the grid track (max-content) let it force
// the row wider than the viewport instead of shrinking to fit.
function resizeStage() {
  const stageEl = sceneContainerEl.parentElement;
  const availableWidth = stageEl.clientWidth || window.innerWidth;
  const availableHeight = stageEl.clientHeight || window.innerHeight * 0.7;
  const size = Math.max(280, Math.floor(Math.min(availableWidth, availableHeight)));
  sceneContainerEl.style.width = `${size}px`;
  sceneContainerEl.style.height = `${size}px`;
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  renderer.setSize(size, size);
}

function updateGroundVisualTilt(angleRad) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -angleRad);
  groundMesh.quaternion.copy(q);
}

// Smooth deterministic bump field: a small sum of sine waves rather than per-vertex
// random noise, so adjacent heightfield cells (and the matching visual mesh) don't
// have jagged discontinuities. seed (0..1) varies the pattern per surface/texture.
function terrainNoise(u, v, seed) {
  const a = Math.sin((u * 3 + seed) * Math.PI * 2) * Math.cos((v * 2 + seed * 1.3) * Math.PI * 2);
  const b = Math.sin((u * 5 * v * 7 + seed * 2.1) * Math.PI * 2);
  const c = Math.sin((v * 7 + seed * 0.7) * Math.PI * 2);
  return 0.5 * a + 0.3 * b + 0.2 * c;
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

// nsubdivs is the number of grid CELLS per side; the heights matrix has
// (nsubdivs + 1) samples per side, matching Rapier's own heightfield demo.
function buildHeightfieldSamples(nsubdivs, amplitude, seed) {
  const heights = new Float32Array((nsubdivs + 1) * (nsubdivs + 1));
  let k = 0;
  for (let i = 0; i <= nsubdivs; i++) {
    const u = i / nsubdivs;
    for (let j = 0; j <= nsubdivs; j++) {
      const v = j / nsubdivs;
      heights[k++] = terrainNoise(u, v, seed) * amplitude;
    }
  }
  return heights;
}

function buildGroundVisualGeometry(nrows, ncols, amplitude, seed) {
  const geom = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, ncols, nrows);
  const pos = geom.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / GROUND_SIZE + 0.5;
    const v = pos.getY(i) / GROUND_SIZE + 0.5;
    pos.setZ(i, terrainNoise(u, v, seed) * amplitude);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  geom.rotateX(-Math.PI / 2);
  return geom;
}

function updateGroundVisualGeometry(nrows, ncols, amplitude, seed) {
  const newGeom = buildGroundVisualGeometry(nrows, ncols, amplitude, seed);
  groundMesh.geometry.dispose();
  groundMesh.geometry = newGeom;
}

// Rapier has no rolling-resistance model: a rigid sphere on ANY incline keeps
// accelerating forever (real round objects lose energy to deformation at the
// contact patch, which rigid-body physics doesn't capture). Velocity-proportional
// damping alone can't fix this — it only produces a nonzero terminal creep speed,
// since the slope's driving force never stops pushing. This applies a constant
// angular deceleration instead (Coulomb-style, not speed-proportional), which
// *can* fully cancel the slope's driving torque below some critical angle and
// let grippy objects genuinely stall, like real static friction would. The
// deceleration ignores each shape's actual radius/inertia (a stylized
// approximation, consistent with the rest of this app's material model).
const ROLL_RESIST_SCALE = 100;

function applyRollingResistance(dt) {
  if (activeObjects.length === 0) return;
  const normalScale = Math.cos(currentSlopeAngle);
  activeObjects.forEach((obj) => {
    if (obj.settled || obj.offSurface) return;
    const body = obj.body;
    const av = body.angvel();
    const angSpeed = Math.hypot(av.x, av.y, av.z);
    if (angSpeed < 1e-4) return;
    const decel = (body.__friction ?? 0.3) * ROLL_RESIST_SCALE * normalScale * dt;
    const newSpeed = Math.max(0, angSpeed - decel);
    const scale = newSpeed / angSpeed;
    body.setAngvel({ x: av.x * scale, y: av.y * scale, z: av.z * scale }, true);
  });
}

let fpsFrameCount = 0;
let fpsLastSampleTime = 0;

function updateFpsCounter(now) {
  fpsFrameCount++;
  if (now - fpsLastSampleTime >= 250) {
    const fps = (fpsFrameCount * 1000) / (now - fpsLastSampleTime);
    fpsCounterEl.textContent = `${fps.toFixed(0)} FPS`;
    fpsFrameCount = 0;
    fpsLastSampleTime = now;
  }
}

function animate(now) {
  requestAnimationFrame(animate);
  updateFpsCounter(now);

  if (world) {
    // Rapier's CCD sweep doesn't reliably catch small fast shapes against a
    // heightfield collider, so a sphere falling from any real height can skip
    // past the surface within a single simulated step. Substepping keeps each
    // step's travel distance well under the smallest object's size instead.
    // Recomputed every frame from the current fastest active object (not a
    // fixed worst-case guess for the whole round), so a large batch runs at
    // MIN_SUBSTEPS once everything has settled instead of paying the falling
    // -phase cost for the entire round.
    const simSpeed = parseFloat(speedSlider.value) || 1;
    const frameDt = (1 / 60) * simSpeed;
    let maxSpeed = 0;
    activeObjects.forEach((obj) => {
      if (obj.settled || obj.offSurface) return;
      const v = obj.body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed > maxSpeed) maxSpeed = speed;
    });
    currentSubsteps = substepsForVelocity(maxSpeed, roundMinRadius, frameDt);
    world.timestep = frameDt / currentSubsteps;
    const subDt = world.timestep;
    for (let i = 0; i < currentSubsteps; i++) {
      applyRollingResistance(subDt);
      world.step();
    }
    if (running) roundSimSeconds += frameDt;
  }
  checkRoundProgress();
  // Settled bodies are fixed and no longer move, so their last-written matrix
  // is still correct — skip re-writing it every frame once a batch has landed.
  const touchedGroups = new Set();
  activeObjects.forEach((obj) => {
    if (obj.offSurface || obj.settled) return;
    const t = obj.body.translation();
    const r = obj.body.rotation();
    setInstanceTransform(obj.group, obj.instanceId, t.x, t.y, t.z, r.x, r.y, r.z, r.w, obj.scale);
    touchedGroups.add(obj.group);
  });
  touchedGroups.forEach((g) => { g.instanceMatrix.needsUpdate = true; });
  controls.update();
  renderer.render(scene, camera);
}

// ---------- Physics world ----------

function setupPhysicsWorld(surface, angleRad) {
  world = new RAPIER.World({ x: 0, y: -9.82, z: 0 });
  world.timestep = 1 / 60 / currentSubsteps;

  const amplitude = clamp01(surface.roughness / 1.2) * MAX_BUMP_HEIGHT;
  const seed = hashSeed(surfaceSelect.value + textureSelect.value);
  const heights = buildHeightfieldSamples(HEIGHTFIELD_SEGMENTS, amplitude, seed);

  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -angleRad);
  const groundBodyDesc = RAPIER.RigidBodyDesc.fixed().setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  groundBody = world.createRigidBody(groundBodyDesc);

  const groundColliderDesc = RAPIER.ColliderDesc.heightfield(
    HEIGHTFIELD_SEGMENTS,
    HEIGHTFIELD_SEGMENTS,
    heights,
    { x: GROUND_SIZE, y: 1, z: GROUND_SIZE }
  )
    // Zeroed out deliberately: friction/restitution are now computed per
    // object (see createPhysicsBody/resolvePairPhysics) and injected via the
    // Max combine rule below, so the ground collider must never win the max.
    .setFriction(0)
    .setRestitution(0)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
  world.createCollider(groundColliderDesc, groundBody);

  if (groundMesh) updateGroundVisualGeometry(HEIGHTFIELD_SEGMENTS, HEIGHTFIELD_SEGMENTS, amplitude, seed);
}

// ---------- Shapes ----------

// Flat Float32Array of every vertex position in a geometry — the input format
// RAPIER.ColliderDesc.convexHull() expects. Shared by the ovoid and Platonic
// solid shapes below, and mirrors the same extraction already used for
// imported .obj/.stl meshes (see handleMeshUpload/registerCustomShape).
function verticesFromGeometry(geom) {
  const pos = geom.getAttribute('position');
  const flat = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    flat[i * 3] = pos.getX(i);
    flat[i * 3 + 1] = pos.getY(i);
    flat[i * 3 + 2] = pos.getZ(i);
  }
  return flat;
}

function convexColliderFromGeometry(geom) {
  const desc = RAPIER.ColliderDesc.convexHull(verticesFromGeometry(geom));
  if (desc) return desc;
  // Degenerate fallback (shouldn't happen for these built-in convex shapes) —
  // same bounding-box fallback used for degenerate imported meshes.
  geom.computeBoundingBox();
  const size = new THREE.Vector3();
  geom.boundingBox.getSize(size);
  return RAPIER.ColliderDesc.cuboid(Math.max(0.005, size.x / 2), Math.max(0.005, size.y / 2), Math.max(0.005, size.z / 2));
}

function buildEllipsoidGeometry(rx, ry, rz) {
  const geom = new THREE.SphereGeometry(1, 24, 18);
  const pos = geom.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * rx, pos.getY(i) * ry, pos.getZ(i) * rz);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}

// Platonic solids (Tetrahedron/Octahedron/Dodecahedron/Icosahedron) and the
// ovoid have no matching exact Rapier collider primitive, so their physics
// shape is a convex hull over the same vertices as the rendered geometry —
// exact for the Platonic solids (Three.js's PolyhedronGeometry is already
// convex) and a close approximation for the ovoid's smooth surface.
function buildPrimitiveGeometryAndShape(kind, sizeMeters) {
  const s = sizeMeters;
  if (kind === 'sphere') {
    const r = s / 2;
    return { three: new THREE.SphereGeometry(r, 20, 16), colliderDesc: RAPIER.ColliderDesc.ball(r) };
  }
  if (kind === 'cylinder') {
    const r = s / 2;
    const hgt = s * 0.35;
    return {
      three: new THREE.CylinderGeometry(r, r, hgt, 24),
      colliderDesc: RAPIER.ColliderDesc.cylinder(hgt / 2, r),
    };
  }
  if (kind === 'rect2to1') {
    // A true 2:1:1 rectangular prism — long axis = target size.
    const short = s / 2;
    return { three: new THREE.BoxGeometry(s, short, short), colliderDesc: RAPIER.ColliderDesc.cuboid(s / 2, short / 2, short / 2) };
  }
  if (kind === 'ovoid') {
    const geom = buildEllipsoidGeometry(s * OVOID_RX_FACTOR, s * OVOID_RY_FACTOR, s * OVOID_RZ_FACTOR);
    return { three: geom, colliderDesc: convexColliderFromGeometry(geom) };
  }
  if (kind === 'tetrahedron') {
    const geom = new THREE.TetrahedronGeometry(s / 2);
    return { three: geom, colliderDesc: convexColliderFromGeometry(geom) };
  }
  if (kind === 'octahedron') {
    const geom = new THREE.OctahedronGeometry(s / 2);
    return { three: geom, colliderDesc: convexColliderFromGeometry(geom) };
  }
  if (kind === 'dodecahedron') {
    const geom = new THREE.DodecahedronGeometry(s / 2);
    return { three: geom, colliderDesc: convexColliderFromGeometry(geom) };
  }
  if (kind === 'icosahedron') {
    const geom = new THREE.IcosahedronGeometry(s / 2);
    return { three: geom, colliderDesc: convexColliderFromGeometry(geom) };
  }
  // Any Archimedean/Catalan/Johnson solid (see POLYHEDRA_DATA) — same convex-
  // hull-over-vertices approach as the Platonic solids/ovoid above, just with
  // the vertex list coming from fetched data instead of a Three.js built-in
  // generator. Pre-normalized to circumradius 0.5, so scaling by `s` alone
  // reproduces the same "target size = circumdiameter" convention.
  if (POLYHEDRA_DATA[kind]) {
    const points = POLYHEDRA_DATA[kind].vertices.map(([x, y, z]) => new THREE.Vector3(x * s, y * s, z * s));
    const geom = new ConvexGeometry(points);
    geom.computeVertexNormals();
    return { three: geom, colliderDesc: convexColliderFromGeometry(geom) };
  }
  // 'cube' and any unrecognized legacy kind (e.g. the old 'box') fall through here.
  return { three: new THREE.BoxGeometry(s, s, s), colliderDesc: RAPIER.ColliderDesc.cuboid(s / 2, s / 2, s / 2) };
}

function registerCustomShape(name, points) {
  const sampled = points.length > 4000 ? samplePoints(points, 4000) : points;
  if (sampled.length < 4) throw new Error('Shape has no volume');

  const centroid = new THREE.Vector3();
  sampled.forEach((v) => centroid.add(v));
  centroid.divideScalar(sampled.length);
  const centered = sampled.map((v) => v.clone().sub(centroid));

  const box = new THREE.Box3().setFromPoints(centered);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const normVertices = centered.map((v) => v.clone().divideScalar(maxDim));

  const geometry = new ConvexGeometry(normVertices);
  geometry.computeVertexNormals();

  const id = `mesh_${Date.now()}`;
  customShapes[id] = { id, label: name, normVertices, geometry };

  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = `Imported: ${name}`;
  shapeSelect.appendChild(opt);
  shapeSelect.value = id;
  uploadStatusEl.textContent = `Loaded "${name}" — normalized to a 1 m bounding box.`;
}

function samplePoints(points, n) {
  const out = [];
  const step = points.length / n;
  for (let i = 0; i < n; i++) out.push(points[Math.floor(i * step)]);
  return out;
}

function handleMeshUpload(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'obj' && ext !== 'stl') {
    uploadStatusEl.textContent = 'Only .obj and .stl files are supported.';
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const points = [];
      if (ext === 'obj') {
        const obj = new OBJLoader().parse(e.target.result);
        obj.traverse((child) => {
          if (child.isMesh) {
            const pos = child.geometry.getAttribute('position');
            for (let i = 0; i < pos.count; i++) points.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
          }
        });
      } else {
        const geom = new STLLoader().parse(e.target.result);
        const pos = geom.getAttribute('position');
        for (let i = 0; i < pos.count; i++) points.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
      }
      if (points.length < 4) throw new Error('not enough geometry to build a convex shape');
      registerCustomShape(file.name, points);
    } catch (err) {
      uploadStatusEl.textContent = `Import failed: ${err.message}`;
    }
  };
  reader.onerror = () => { uploadStatusEl.textContent = 'Could not read file.'; };
  if (ext === 'obj') reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}

// ---------- Materials / advanced UI ----------

function updateAdvancedLabels() {
  densityValue.textContent = densitySlider.value;
  hardnessValue.textContent = parseFloat(hardnessSlider.value).toFixed(2);
  frictionValue.textContent = parseFloat(frictionSlider.value).toFixed(2);
}

// Short "(source)" line for the currently selected object material, resolved
// against whichever surface is currently selected (restitution/friction are a
// property of the PAIR, not the object alone — see resolvePairPhysics).
function citeMaterial(key) {
  if (key === 'custom') return SOURCES.none.short;
  const el = MATERIAL_LIBRARY[key];
  const surfKey = SURFACE_PRESETS[surfaceSelect.value].materialKey;
  if (el.HV == null) {
    return `density/modulus: ${SOURCES[el.sourceRef].short}; restitution/friction: ${SOURCES.graphiteEstimate.short}`;
  }
  const frictionSrc = CRC_FRICTION[`${key}|${surfKey}`] !== undefined ? SOURCES.crcFriction.short : SOURCES.frictionFallback.short;
  return `density/modulus/hardness: ${SOURCES[el.sourceRef].short}; restitution: ${SOURCES.strongeJohnsonModel.short}; friction: ${frictionSrc}`;
}

function updateMaterialInfo() {
  const key = materialSelect.value;
  customPropsEl.style.display = key === 'custom' ? 'block' : 'none';
  let density, restitution, friction;
  if (key === 'custom') {
    density = parseFloat(densitySlider.value);
    restitution = parseFloat(hardnessSlider.value);
    friction = parseFloat(frictionSlider.value);
  } else {
    const el = MATERIAL_LIBRARY[key];
    const surfKey = SURFACE_PRESETS[surfaceSelect.value].materialKey;
    const dropHeightM = parseFloat(heightSlider.value) || 0;
    const phys = resolvePairPhysics(key, surfKey, dropHeightM);
    const mult = TEXTURE_MULT[textureSelect.value].friction;
    density = el.density;
    restitution = phys.restitution;
    friction = clamp01(phys.friction * mult);
  }
  materialDensityEl.textContent = `${density} kg/m³`;
  materialRestitutionEl.textContent = restitution.toFixed(2);
  materialFrictionEl.textContent = friction.toFixed(2);
  materialInfoEl.textContent = citeMaterial(key);
}

function updateSurfaceInfo() {
  const surface = getSurface();
  const el = MATERIAL_LIBRARY[surface.materialKey];
  surfaceFrictionEl.textContent = 'see Material panel';
  surfaceRestitutionEl.textContent = 'see Material panel';
  surfaceInfoEl.textContent = `${el.label} — density/modulus/hardness: ${SOURCES[el.sourceRef].short}. Friction and restitution depend on which object material is dropped on it (composite of both materials' properties), shown in the Material panel once a drop height and object are chosen.`;
}

function resolveCurrentMaterial() {
  const key = materialSelect.value;
  if (key === 'custom') {
    return {
      key: 'custom', custom: true, label: 'Custom',
      density: parseFloat(densitySlider.value),
      restitution: parseFloat(hardnessSlider.value),
      friction: parseFloat(frictionSlider.value),
      color: CUSTOM_MATERIAL.color,
      metal: false,
    };
  }
  const el = MATERIAL_LIBRARY[key];
  return { key, label: el.label, density: el.density, color: el.color, metal: !!el.metal };
}

// ---------- Batch ----------

function buildItemDefFromControls() {
  const shapeVal = shapeSelect.value;
  const isMesh = !!customShapes[shapeVal];
  const material = resolveCurrentMaterial();
  const shapeLabel = isMesh
    ? customShapes[shapeVal].label
    : (PRIMITIVE_SHAPES[shapeVal] || POLYHEDRA_DATA[shapeVal]).label;
  return {
    shapeKind: isMesh ? 'mesh' : shapeVal,
    meshId: isMesh ? shapeVal : undefined,
    sizeMeters: parseFloat(sizeSlider.value) || 0.06,
    material,
    shapeLabel,
    label: `${material.label} ${shapeLabel}`,
  };
}

function addBatchItem() {
  const count = Math.max(1, Math.min(60, parseInt(countInput.value, 10) || 1));
  const itemDef = buildItemDefFromControls();
  batch.push({ itemDef, count });
  renderBatchList();
}

function renderBatchList() {
  batchListEl.innerHTML = '';
  if (batch.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No items yet';
    batchListEl.appendChild(empty);
  }
  batch.forEach((entry) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${entry.itemDef.label} × ${entry.count}`;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      batch = batch.filter((b) => b !== entry);
      renderBatchList();
    });
    li.appendChild(label);
    li.appendChild(removeBtn);
    batchListEl.appendChild(li);
  });
  dropBtn.disabled = batch.length === 0;
  updatePreview();
}

// Roughness also jitters each object's own friction/restitution and gives it a
// small random tumble, layered on top of the real bump geometry in the heightfield.
function jitterMaterialForRoughness(material, roughness) {
  if (!roughness) return material;
  return {
    ...material,
    friction: clamp01(material.friction + (Math.random() - 0.5) * roughness * 0.4),
    restitution: clamp01(material.restitution + (Math.random() - 0.5) * roughness * 0.25),
  };
}

// Creates the Rapier body+collider only — rendering is handled separately via
// a shared InstancedMesh per batch entry (see createInstancedGroup), since a
// large batch as one Mesh per object means one draw call per object.
// `surface` is the resolved getSurface() result for the round; restitution/
// friction are resolved HERE (not baked into itemDef at batch-add time) so a
// mixed-material batch gets the correct pair physics per object, and so
// changing surface/height after adding items to the batch is still honored.
function createPhysicsBody(itemDef, x, y, z, surface, dropHeightM) {
  let colliderDesc;
  const mat = itemDef.material;
  const basePhysics = mat.custom
    ? { restitution: mat.restitution, friction: mat.friction }
    : resolvePairPhysics(mat.key, surface.materialKey, dropHeightM);
  const friction = clamp01(basePhysics.friction * (mat.custom ? 1 : surface.frictionMult));
  const jitteredMaterial = jitterMaterialForRoughness({ friction, restitution: basePhysics.restitution }, surface.roughness);

  if (itemDef.shapeKind === 'mesh') {
    const shapeData = customShapes[itemDef.meshId];
    const scale = itemDef.sizeMeters;
    const flat = new Float32Array(shapeData.normVertices.length * 3);
    shapeData.normVertices.forEach((v, i) => {
      flat[i * 3] = v.x * scale;
      flat[i * 3 + 1] = v.y * scale;
      flat[i * 3 + 2] = v.z * scale;
    });
    colliderDesc = RAPIER.ColliderDesc.convexHull(flat);
    if (!colliderDesc) {
      // Degenerate point cloud (e.g. near-planar mesh) — fall back to its bounding box.
      const box = new THREE.Box3().setFromBufferAttribute(shapeData.geometry.getAttribute('position'));
      const size = new THREE.Vector3();
      box.getSize(size);
      colliderDesc = RAPIER.ColliderDesc.cuboid(
        Math.max(0.005, (size.x * scale) / 2),
        Math.max(0.005, (size.y * scale) / 2),
        Math.max(0.005, (size.z * scale) / 2)
      );
    }
  } else {
    colliderDesc = buildPrimitiveGeometryAndShape(itemDef.shapeKind, itemDef.sizeMeters).colliderDesc;
  }

  colliderDesc
    .setDensity(mat.density)
    .setFriction(jitteredMaterial.friction)
    .setRestitution(jitteredMaterial.restitution)
    // Max combine + a zeroed-out ground collider (see setupPhysicsWorld) means
    // this already-composited pair value is what Rapier actually uses,
    // regardless of what other materials are in the same batch.
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);

  const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  const initialQuat = new THREE.Quaternion().setFromAxisAngle(axis, Math.random() * Math.PI * 2);

  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z)
    .setRotation({ x: initialQuat.x, y: initialQuat.y, z: initialQuat.z, w: initialQuat.w })
    .setLinearDamping(0.05)
    .setAngularDamping(0.15)
    .setCcdEnabled(true);
  const body = world.createRigidBody(bodyDesc);
  world.createCollider(colliderDesc, body);

  if (surface.roughness > 0) {
    body.setAngvel(
      { x: (Math.random() - 0.5) * surface.roughness * 4, y: (Math.random() - 0.5) * surface.roughness * 4, z: (Math.random() - 0.5) * surface.roughness * 4 },
      true
    );
  }
  body.__friction = jitteredMaterial.friction;

  return body;
}

// One InstancedMesh per batch entry (all its instances share shape/material),
// used for both the pre-drop preview and the live drop. Custom-mesh geometry
// is shared with customShapes and must not be disposed; primitive geometry is
// built fresh per group and is safe to dispose with it.
function createInstancedGroup(itemDef, count) {
  const threeGeom = itemDef.shapeKind === 'mesh'
    ? customShapes[itemDef.meshId].geometry
    : buildPrimitiveGeometryAndShape(itemDef.shapeKind, itemDef.sizeMeters).three;
  const material = new THREE.MeshStandardMaterial({
    color: itemDef.material.color,
    metalness: itemDef.material.metal ? 0.8 : 0.05,
    roughness: itemDef.material.metal ? 0.35 : 0.75,
  });
  const instancedMesh = new THREE.InstancedMesh(threeGeom, material, count);
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  instancedMesh.userData.disposeGeometry = itemDef.shapeKind !== 'mesh';
  scene.add(instancedMesh);
  return instancedMesh;
}

function disposeGroup(instancedMesh) {
  instancedMesh.material.dispose();
  if (instancedMesh.userData.disposeGeometry) instancedMesh.geometry.dispose();
}

const _instMatrix = new THREE.Matrix4();
const _instPos = new THREE.Vector3();
const _instQuat = new THREE.Quaternion();
const _instScale = new THREE.Vector3();

function setInstanceTransform(instancedMesh, instanceId, x, y, z, qx, qy, qz, qw, scale) {
  _instPos.set(x, y, z);
  _instQuat.set(qx, qy, qz, qw);
  _instScale.set(scale, scale, scale);
  _instMatrix.compose(_instPos, _instQuat, _instScale);
  instancedMesh.setMatrixAt(instanceId, _instMatrix);
}

function hideInstance(obj) {
  _instMatrix.makeScale(0, 0, 0);
  obj.group.setMatrixAt(obj.instanceId, _instMatrix);
  obj.group.instanceMatrix.needsUpdate = true;
}

// ---------- Round lifecycle ----------

// Approximate half-diagonal of each shape's bounding box, used only to keep
// spawn positions from overlapping — doesn't need to be exact, just not smaller
// than the real shape.
function estimateBoundingRadius(itemDef) {
  const s = itemDef.sizeMeters;
  const kind = itemDef.shapeKind;
  if (kind === 'sphere') return s / 2;
  if (kind === 'cylinder') return 0.5 * Math.hypot(s, s * 0.35);
  if (kind === 'mesh') return s * 0.75;
  if (kind === 'rect2to1') { const short = s / 2; return 0.5 * Math.hypot(s, short, short); }
  if (kind === 'ovoid') return s * OVOID_RY_FACTOR; // tallest semi-axis = farthest vertex from center
  if (kind === 'tetrahedron' || kind === 'octahedron' || kind === 'dodecahedron' || kind === 'icosahedron') return s / 2; // built at exactly this circumradius
  if (POLYHEDRA_DATA[kind]) return s / 2; // Archimedean/Catalan/Johnson solids — normalized to circumradius 0.5, so s/2 at target size s
  if (kind === 'cube') return 0.5 * Math.sqrt(3) * s; // half the space diagonal
  const depth = s * 0.8; // legacy 'box' fallback
  return 0.5 * Math.hypot(s, depth, depth);
}

// Packs items into a clustered, varied-height pile (like a handful being
// dropped) using rejection sampling with a 3D distance check against every
// already-placed item, so nothing spawns overlapping — real solids can't
// interpenetrate, even clasped tightly together. Falls back to widening the
// cluster if an item can't find a free spot after enough attempts, so dense
// batches still terminate instead of looping forever.
function packClusterPositions(items, heightMeters) {
  const positions = [];
  const baseRadius = Math.max(0.015, ...items.map((it) => it.radius));
  let clusterRadius = baseRadius * 1.5 + Math.cbrt(items.length) * baseRadius * 0.7;
  const maxAttempts = 80;

  items.forEach((item) => {
    let attempts = 0;
    while (true) {
      attempts++;
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * clusterRadius;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      const y = Math.max(item.radius + 0.005, heightMeters + (Math.random() - 0.5) * heightMeters * 0.5);

      let overlaps = false;
      for (const p of positions) {
        const minDist = (p.radius + item.radius) * 1.02;
        const dx = p.x - x, dy = p.y - y, dz = p.z - z;
        if (dx * dx + dy * dy + dz * dz < minDist * minDist) { overlaps = true; break; }
      }
      if (!overlaps) {
        positions.push({ x, y, z, radius: item.radius });
        break;
      }
      if (attempts >= maxAttempts) {
        clusterRadius *= 1.2;
        attempts = 0;
      }
    }
  });

  return positions;
}

// Shows the packed "in hand" arrangement in the scene as plain (non-physics)
// meshes before Drop is pressed, so the cluster is visible ahead of time.
// Drop then reuses these exact positions instead of re-rolling new ones.
function clearPreview() {
  previewGroups.forEach((g) => { scene.remove(g); disposeGroup(g); });
  previewGroups = [];
  previewObjects = [];
}

function updatePreview() {
  clearPreview();
  if (running || batch.length === 0) return;

  const heightMeters = parseFloat(heightSlider.value) || 1;
  const items = [];
  batch.forEach((entry) => {
    for (let i = 0; i < entry.count; i++) {
      items.push({ itemDef: entry.itemDef, radius: estimateBoundingRadius(entry.itemDef) });
    }
  });
  const positions = packClusterPositions(items, heightMeters);

  let idx = 0;
  batch.forEach((entry) => {
    const instancedMesh = createInstancedGroup(entry.itemDef, entry.count);
    const scale = entry.itemDef.shapeKind === 'mesh' ? entry.itemDef.sizeMeters : 1;
    for (let i = 0; i < entry.count; i++) {
      const { x, y, z } = positions[idx];
      setInstanceTransform(instancedMesh, i, x, y, z, 0, 0, 0, 1, scale);
      previewObjects.push({ itemDef: entry.itemDef, x, y, z });
      idx++;
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    previewGroups.push(instancedMesh);
  });
}

// Fast falling objects can skip clean through the heightfield within a single
// physics step if the step's travel distance approaches the object's own size
// (see the substepping note in animate()). Sizing substeps to the current
// fastest object and the batch's smallest item means slow/settled rounds run
// cheap while fast falls still get fine enough steps to not tunnel. Using the
// *previous* frame's velocity to size *this* frame's steps is safe here:
// gravity only changes speed by ~0.16 m/s per frame, and collisions can't
// increase speed (restitution <= 1), so velocity never jumps enough between
// frames for last frame's estimate to undersize the step that matters.
function substepsForVelocity(maxSpeed, minRadius, frameDt) {
  if (maxSpeed < 1e-4 || !minRadius) return MIN_SUBSTEPS;
  const safetyFactor = 0.4;
  const subDtNeeded = (safetyFactor * minRadius) / maxSpeed;
  const steps = Math.ceil(frameDt / subDtNeeded);
  return Math.min(MAX_SUBSTEPS, Math.max(MIN_SUBSTEPS, steps));
}

function dropAll() {
  if (batch.length === 0) return;
  teardownRound();
  if (previewObjects.length === 0) updatePreview();

  roundMinRadius = Math.min(...batch.map((e) => estimateBoundingRadius(e.itemDef)));

  const surface = getSurface();
  const angleRad = currentAngleRad();
  currentSlopeAngle = angleRad;
  setupPhysicsWorld(surface, angleRad);
  updateGroundVisualTilt(angleRad);

  lastRoundConfig = {
    surfaceLabel: SURFACE_PRESETS[surfaceSelect.value].label,
    texture: textureSelect.value,
    tiltDeg: parseFloat(angleSlider.value),
    dropHeightM: parseFloat(heightSlider.value),
    batch: batch.map((entry) => ({
      material: entry.itemDef.material.label,
      shape: entry.itemDef.shapeLabel,
      count: entry.count,
    })),
  };

  // Release the exact arrangement already shown in the preview, so what the
  // user saw before hitting Drop is exactly what falls. previewObjects is laid
  // out in contiguous per-entry blocks (built by the same batch.forEach order
  // in updatePreview), so it can be sliced back into one InstancedMesh group
  // per entry rather than one Mesh per object.
  const spawnPositions = previewObjects.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  clearPreview();

  const dropHeightM = parseFloat(heightSlider.value) || 0;
  let idx = 0;
  batch.forEach((entry) => {
    const instancedMesh = createInstancedGroup(entry.itemDef, entry.count);
    const scale = entry.itemDef.shapeKind === 'mesh' ? entry.itemDef.sizeMeters : 1;
    for (let i = 0; i < entry.count; i++) {
      const { x, y, z } = spawnPositions[idx];
      idx++;
      const body = createPhysicsBody(entry.itemDef, x, y, z, surface, dropHeightM);
      activeObjects.push({ body, group: instancedMesh, instanceId: i, scale, settled: false, offSurface: false, stableFrames: 0 });
    }
  });

  running = true;
  roundSimSeconds = 0;
  lastResult = null;
  // Deliberately left enabled (see dropAll's teardownRound() call above): Drop
  // doubles as an interrupt-and-restart, so a mid-round or just-settled click
  // (or the D hotkey) always tears down whatever's active and starts fresh
  // rather than requiring Reset first.
  statusEl.textContent = `Dropping ${activeObjects.length} item(s)…`;
  resultsSummaryEl.textContent = 'Simulating…';
  resultsGridEl.innerHTML = '';
  drawGroundTexture();
}

function freezeBody(obj) {
  obj.settled = true;
  obj.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  obj.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  obj.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
}

function checkRoundProgress() {
  if (!running) return;
  if (roundSimSeconds > MAX_ROUND_MS / 1000) {
    finishRound(true);
    return;
  }
  let stillActive = false;
  activeObjects.forEach((obj) => {
    if (obj.settled || obj.offSurface) return;
    const t = obj.body.translation();
    if (t.y < OFF_SURFACE_Y) {
      obj.offSurface = true;
      world.removeRigidBody(obj.body);
      hideInstance(obj);
      return;
    }
    const lin = obj.body.linvel();
    const ang = obj.body.angvel();
    const linSpeed = Math.hypot(lin.x, lin.y, lin.z);
    const angSpeed = Math.hypot(ang.x, ang.y, ang.z);
    if (linSpeed < SETTLE_LINEAR && angSpeed < SETTLE_ANGULAR) {
      obj.stableFrames += 1;
      if (obj.stableFrames > SETTLE_FRAMES) {
        freezeBody(obj);
        return;
      }
    } else {
      obj.stableFrames = 0;
    }
    stillActive = true;
  });
  if (!stillActive) finishRound(false);
}

function finishRound(timedOut) {
  running = false;
  // dropBtn's disabled state is governed solely by renderBatchList() (batch
  // empty or not) — see the note in dropAll() for why it's never disabled
  // just because a round is in progress.

  activeObjects.forEach((obj) => {
    if (!obj.settled && !obj.offSurface) freezeBody(obj);
  });

  const { counts, rows, cols } = computeGridCounts();
  const offSurface = activeObjects.filter((o) => o.offSurface).length;
  const onSurface = activeObjects.length - offSurface;
  const busiestCell = computeBusiestCell(counts);

  lastResult = { counts, rows, cols, onSurface, offSurface, busiestCell, timedOut, config: lastRoundConfig };
  renderResultsPanel(lastResult);
  drawGroundTexture();

  statusEl.textContent = `${timedOut ? 'Settled (timeout). ' : 'Settled. '}${onSurface} on surface, ${offSurface} off surface.`;
}

function computeGridCounts() {
  const cols = clampInt(colsInput.value, 2, 50, 6);
  const rows = clampInt(rowsInput.value, 2, 50, 6);
  const counts = Array.from({ length: rows }, () => Array(cols).fill(0));
  const gr = groundBody.rotation();
  const invQ = new THREE.Quaternion(gr.x, gr.y, gr.z, gr.w).invert();

  activeObjects.forEach((obj) => {
    if (obj.offSurface) return;
    const t = obj.body.translation();
    const rel = new THREE.Vector3(t.x, t.y, t.z);
    rel.applyQuaternion(invQ);
    let col = Math.floor(((rel.x + GROUND_SIZE / 2) / GROUND_SIZE) * cols);
    let row = Math.floor(((rel.z + GROUND_SIZE / 2) / GROUND_SIZE) * rows);
    col = Math.min(cols - 1, Math.max(0, col));
    row = Math.min(rows - 1, Math.max(0, row));
    counts[row][col] += 1;
  });

  return { counts, rows, cols };
}

// 1-indexed row/col, matching the labeling already shown in the results panel.
function computeBusiestCell(counts) {
  let max = 0;
  let cell = null;
  counts.forEach((rowArr, r) => rowArr.forEach((c, colIdx) => {
    if (c > max) { max = c; cell = { row: r + 1, col: colIdx + 1, count: c }; }
  }));
  return cell;
}

function renderResultsPanel(result) {
  const { counts, rows, cols, onSurface, offSurface, busiestCell } = result;
  resultsSummaryEl.textContent =
    `On surface: ${onSurface}\nOff surface: ${offSurface}\n` +
    (busiestCell ? `Busiest cell: row ${busiestCell.row}, col ${busiestCell.col} (${busiestCell.count})` : '');

  resultsGridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  resultsGridEl.innerHTML = '';
  counts.forEach((rowArr) => rowArr.forEach((c) => {
    const cell = document.createElement('div');
    cell.className = 'cell' + (c > 0 ? ' has-count' : '');
    cell.textContent = c > 0 ? c : '-';
    resultsGridEl.appendChild(cell);
  }));
}

function teardownRound() {
  const groups = new Set();
  activeObjects.forEach((obj) => {
    if (!obj.offSurface && world) world.removeRigidBody(obj.body);
    groups.add(obj.group);
  });
  groups.forEach((g) => { scene.remove(g); disposeGroup(g); });
  activeObjects = [];
  running = false;
}

function resetAll() {
  teardownRound();
  lastResult = null;
  statusEl.textContent = batch.length ? 'Ready to drop.' : 'Add items to the batch, then drop.';
  resultsSummaryEl.textContent = 'No drops yet.';
  resultsGridEl.innerHTML = '';
  dropBtn.disabled = batch.length === 0;
  drawGroundTexture();
  updatePreview();
}

function copyResults() {
  if (!lastResult) return;
  const { counts, rows, cols, offSurface, config } = lastResult;
  const lines = [`Surface: ${config.surfaceLabel} (${config.texture}), tilt ${config.tiltDeg}°, drop height ${config.dropHeightM.toFixed(1)} m`];
  lines.push(`Grid: ${cols} cols × ${rows} rows`);
  counts.forEach((rowArr, r) => lines.push(`row ${r + 1}: ${rowArr.join(' ')}`));
  lines.push(`Off surface: ${offSurface}`);
  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    const original = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = original; }, 1200);
  });
}

// n (as a number) for occupied cells, "-" for empty ones — a quick-scan text
// readout of the grid that doesn't require parsing the numeric array.
function buildAsciiGrid(counts) {
  return counts.map((rowArr) => rowArr.map((c) => (c > 0 ? String(c) : '-')).join(' '));
}

function exportResultsJson() {
  if (!lastResult) return;
  const { counts, rows, cols, onSurface, offSurface, busiestCell, config } = lastResult;
  const payload = {
    surface: {
      type: config.surfaceLabel,
      texture: config.texture,
      tiltDeg: config.tiltDeg,
      dropHeightM: config.dropHeightM,
    },
    batch: config.batch,
    grid: { rows, cols },
    onSurface,
    offSurface,
    busiestCell,
    asciiGrid: buildAsciiGrid(counts),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stone-throw-results-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  const original = exportBtn.textContent;
  exportBtn.textContent = 'Exported!';
  setTimeout(() => { exportBtn.textContent = original; }, 1200);
}

// ---------- Ground texture (grid + heatmap) ----------

function drawGroundTexture() {
  const preset = SURFACE_PRESETS[surfaceSelect.value];
  const mult = TEXTURE_MULT[textureSelect.value];
  const roughnessVisual = preset.roughness * mult.roughness;
  const cols = clampInt(colsInput.value, 2, 50, 6);
  const rows = clampInt(rowsInput.value, 2, 50, 6);
  const w = heatmapCanvas.width, h = heatmapCanvas.height;

  heatCtx.clearRect(0, 0, w, h);
  heatCtx.fillStyle = preset.base;
  heatCtx.fillRect(0, 0, w, h);

  heatCtx.globalAlpha = 0.3;
  heatCtx.fillStyle = preset.accent;
  const seedCount = Math.round(roughnessVisual * 220);
  let seed = 12345;
  for (let i = 0; i < seedCount; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const rx = (seed / 233280) * w;
    seed = (seed * 9301 + 49297) % 233280;
    const ry = (seed / 233280) * h;
    heatCtx.beginPath();
    heatCtx.arc(rx, ry, 2, 0, Math.PI * 2);
    heatCtx.fill();
  }
  heatCtx.globalAlpha = 1;

  if (lastResult) {
    const { counts, rows: r2, cols: c2 } = lastResult;
    let max = 1;
    counts.forEach((rowArr) => rowArr.forEach((c) => { if (c > max) max = c; }));
    const cellW = w / c2, cellH = h / r2;
    counts.forEach((rowArr, ri) => rowArr.forEach((c, ci) => {
      if (c === 0) return;
      const alpha = 0.2 + 0.6 * (c / max);
      heatCtx.fillStyle = `rgba(230, 57, 70, ${alpha})`;
      heatCtx.fillRect(ci * cellW, ri * cellH, cellW, cellH);
    }));
  }

  heatCtx.strokeStyle = 'rgba(255,255,255,0.3)';
  heatCtx.lineWidth = 2;
  for (let c = 1; c < cols; c++) {
    const x = (w / cols) * c;
    heatCtx.beginPath(); heatCtx.moveTo(x, 0); heatCtx.lineTo(x, h); heatCtx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    const y = (h / rows) * r;
    heatCtx.beginPath(); heatCtx.moveTo(0, y); heatCtx.lineTo(w, y); heatCtx.stroke();
  }
  heatCtx.strokeStyle = 'rgba(255,255,255,0.5)';
  heatCtx.strokeRect(1, 1, w - 2, h - 2);

  groundTexture.needsUpdate = true;
}
