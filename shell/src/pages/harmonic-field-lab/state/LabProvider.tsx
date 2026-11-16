/**
 * The one lab state for the page: a reducer (labState.ts), restored from storage before the first render, saved after
 * changes, with the analysis of the active tab derived by `useMemo` and the voice engine wired in. A frozen provider
 * (tests, an embedding) is given `frozen` (a fixed initial state, nothing stored, nothing sounds).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { mulNotes } from '../../../lib/harmonic-field';
import { useLabAudio } from '../audio/useLabAudio';
import { loadComposites, saveComposites } from './compositeStore';
import { LabContext, type Analyses, type Lab, type VizApi } from './context';
import { chordModel, deriveBase, dissOf, edoOf, keysOf, spectrumOf, stripDevs } from './derive';
import { readDeveloperOptions } from './developerOptions';
import { ownerOfTab, isModified, updateBlocker as blockerOf } from './generatorLibrary';
import {
  activeTab,
  initialState,
  labReducer,
  makeTab,
  matchCents,
  type LabState,
  type Tab,
} from './labState';
import { setView, viewOf, type VizId, type VizView } from './layout';
import { loadLibrary, saveLibrary } from './libraryStore';
import { loadPatterns, savePatterns } from './patternStore';
import {
  loadLayout,
  loadSettings,
  loadRetuner,
  loadTemplates,
  loadTabs,
  KEY_GENERATORS,
  KEY_CHORDSHELF,
  KEY_COMPOSITES,
  KEY_PATTERNS,
  saveLayout,
  saveRetuner,
  saveSettings,
  saveTemplates,
  saveTabs,
} from './persist';
import { initialRetuner, storedCards, type DormantCard, type RetCard } from './retuner';
import { cardFromSnapshot } from './retunerCards';
import { noteHovered } from './sendStore';
import { loadShelf, saveShelf } from './shelfStore';
import { sketchPositionalPitches } from './sketchChord';
import type { VizSettings } from './vizState';

/** The state from storage; every part falls back to its default (see persist.ts), nothing throws. */
export function restoreState(): LabState {
  const base = initialState();
  const stored = loadTabs();
  let tabs: Tab[] = base.tabs;
  let active = 0;
  let nextTab = base.nextTab;
  if (stored) {
    tabs = stored.tabs.map((s) => {
      const t = makeTab(s.id, s.gen, s.name);
      const sel = matchCents(t.field, s.selCents);
      // inputs that no longer build (a repeat saved mid-edit): keep the stored selection for the first good build
      const pending =
        t.field.length === 0 && s.selCents.length > 0
          ? { cents: s.selCents, mode: s.mode }
          : undefined;
      return {
        ...t,
        ...(s.link ? { link: s.link } : {}),
        ...(s.from ? { fromChord: s.from } : {}),
        ...(pending ? { pending } : {}),
        sel,
        mode: sel.length && s.mode < sel.length ? s.mode : 0,
        cmp: s.cmp.ref === 'picked' && !s.pick.ref ? { ...s.cmp, ref: 'edo12' } : s.cmp,
        pick: s.pick,
      };
    });
    active = stored.active;
    nextTab = Math.max(...tabs.map((t) => Number(t.id.slice(1)))) + 1;
  }
  const storedRet = loadRetuner();
  // a card whose snapshot no longer builds or selects nothing cannot play: kept dormant, so a save never drops it
  const retCards: RetCard[] = [];
  const dormant: DormantCard[] = [];
  storedRet.cards.forEach((c, at) => {
    const card = cardFromSnapshot(c.name, c.snap);
    if (card) {
      retCards.push(card);
    } else {
      dormant.push({ at, spec: c });
    }
  });
  // stored generators.v1 wins; else the legacy subsets.v1 list is migrated in memory (nothing is written on mount)
  const { library } = loadLibrary();
  const ui = loadSettings();
  return {
    ...base,
    tabs,
    active,
    nextTab,
    library,
    ui,
    layout: loadLayout(),
    templates: loadTemplates(),
    patterns: loadPatterns(),
    shelf: loadShelf(),
    composites: loadComposites(),
    retuner: initialRetuner(retCards, storedRet.settings, dormant, ui.modePlayback === 'relative'),
  };
}

interface Props {
  children: ReactNode;
  /** A fixed starting state (the mock, tests). Without it the state is restored from storage. */
  initial?: LabState;
  /** Frozen: nothing is stored and nothing sounds. */
  frozen?: boolean;
}

export function LabProvider({ children, initial, frozen = false }: Props) {
  const [state, dispatch] = useReducer(labReducer, undefined, () =>
    frozen ? (initial ?? initialState()) : (initial ?? restoreState())
  );
  const tab = activeTab(state);
  const base = useMemo(() => deriveBase(tab), [tab.field, tab.rep, tab.sel, tab.mode]);
  const owner = useMemo(() => ownerOfTab(state.library, tab), [state.library, tab.gen, tab.link]);
  const modified = useMemo(
    () => isModified(state.library, tab),
    [state.library, tab.gen, tab.link]
  );
  const updateBlocker = useMemo(
    () => blockerOf(state.library, tab),
    [state.library, tab.gen, tab.link]
  );
  const strip = useMemo(() => stripDevs(base, tab), [base, tab.cmp, tab.pick.ref]);

  const tol = state.ui.tol;
  // each analysis depends only on what it reads, so a change of tolerance recomputes only the keys
  const spectrum = useMemo(() => spectrumOf(base), [base]);
  const chords = useMemo(() => chordModel(base, state.templates), [base, state.templates]);
  const keys = useMemo(() => keysOf(base, tol), [base, tol]);
  const edo = useMemo(() => edoOf(base), [base]);
  const diss = useMemo(() => dissOf(base.repC), [base.repC]);
  const an = useMemo<Analyses>(
    () => ({ spectrum, chords, keys, edo, diss }),
    [spectrum, chords, keys, edo, diss]
  );

  /* ---- persistence ----
   * Restore already happened (synchronously, in the reducer initialiser). A part is written only once its state differs
   * from the restored one, so nothing is written on mount (a stored value the page could not fully use is never
   * overwritten by what it made of it). A failed write is reported (`storeFailed`) where it matters. */
  const restored = useRef(state);
  const store = !frozen;
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const wrote = (key: string, ok: boolean) =>
    setFailed((f) => (f[key] === !ok ? f : { ...f, [key]: !ok }));
  useEffect(() => {
    if (store && state.ui !== restored.current.ui) {
      wrote('ui', saveSettings(state.ui));
    }
  }, [store, state.ui]);
  useEffect(() => {
    if (store && state.layout !== restored.current.layout) {
      wrote('layout', saveLayout(state.layout));
    }
  }, [store, state.layout]);
  useEffect(() => {
    if (
      store &&
      (state.tabs !== restored.current.tabs || state.active !== restored.current.active)
    ) {
      wrote('tabs', saveTabs(state.tabs, state.active));
    }
  }, [store, state.tabs, state.active]);
  useEffect(() => {
    if (store && state.templates !== restored.current.templates) {
      wrote('templates', saveTemplates(state.templates));
    }
  }, [store, state.templates]);
  useEffect(() => {
    if (store && state.patterns.list !== restored.current.patterns.list) {
      wrote('patterns', savePatterns(state.patterns));
    }
  }, [store, state.patterns.list]);
  // the cards and settings only: the run (active card, roots, held keys) is never stored
  useEffect(() => {
    if (
      store &&
      (state.retuner.cards !== restored.current.retuner.cards ||
        state.retuner.dormant !== restored.current.retuner.dormant ||
        state.retuner.settings !== restored.current.retuner.settings)
    ) {
      wrote('retuner', saveRetuner(storedCards(state.retuner), state.retuner.settings));
    }
  }, [store, state.retuner]); // the identity checks above decide whether anything is written
  useEffect(() => {
    if (store && state.library !== restored.current.library) {
      wrote('library', saveLibrary(state.library));
    }
  }, [store, state.library]);
  useEffect(() => {
    if (store && state.shelf.chords !== restored.current.shelf.chords) {
      wrote('shelf', saveShelf(state.shelf));
    }
  }, [store, state.shelf.chords]);
  useEffect(() => {
    if (store && state.composites.list !== restored.current.composites.list) {
      wrote('composites', saveComposites(state.composites));
    }
  }, [store, state.composites.list]);
  // another window saved the library: take it, so this window's next save cannot wipe it
  useEffect(() => {
    if (!store) {
      return;
    }
    const on = (e: StorageEvent) => {
      if (e.key === KEY_GENERATORS || e.key === null) {
        dispatch({ type: 'lib/sync', library: loadLibrary().library });
      }
      if (e.key === KEY_CHORDSHELF || e.key === null) {
        dispatch({ type: 'shelf/sync', shelf: loadShelf() });
      }
      if (e.key === KEY_PATTERNS || e.key === null) {
        dispatch({ type: 'patterns/sync', patterns: loadPatterns() });
      }
      if (e.key === KEY_COMPOSITES || e.key === null) {
        dispatch({ type: 'composite/sync', composites: loadComposites() });
      }
    };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, [store]);
  const storeFailed = Object.values(failed).some(Boolean);

  /* ---- derived pointers ---- */
  const chord = useMemo<ReadonlySet<number>>(
    () => state.chordHover ?? state.chordPick ?? new Set<number>(),
    [state.chordHover, state.chordPick]
  );
  const selected = useMemo<ReadonlySet<number>>(
    () => (state.preview ? new Set(state.preview) : base.selected),
    [state.preview, base.selected]
  );

  // M9: the picked positional chord as a shape (its intervals above its own root), for hold 4 and hold 5
  const skPositional = state.shelf.sketch.positional;
  const skRootDeg = state.shelf.sketch.rootDeg;
  const positionalShape = useMemo(() => {
    const pitches = skPositional
      ? sketchPositionalPitches(base.field, base.rep, base.idx, base.mode, {
          positional: skPositional,
          rootDeg: skRootDeg,
        })
      : null;
    return pitches ? pitches.map((p) => mulNotes(p, pitches[0], -1)) : null;
  }, [skPositional, skRootDeg, base.field, base.rep, base.idx, base.mode]);

  const audio = useLabAudio({
    enabled: !frozen,
    base,
    ui: state.ui,
    chord,
    retuner: state.retuner,
    // hold 4 plays the armed template; before one is picked it is the first template, as the Sketch row shows it
    sketch: {
      template: state.shelf.sketch.template ?? state.templates[0]?.text ?? null,
      shape: state.shelf.sketch.shape,
      rootDeg: state.shelf.sketch.rootDeg,
      exact: state.shelf.sketch.exact,
      positional: state.shelf.sketch.positional,
      positionalShape,
    },
    shelf: state.shelf.chords,
    keys: state.keys,
    dispatch,
  });

  // every view that points at a note calls setHover, so it also sets the hold-1 note target
  const lastHover = useRef<number | null>(null);
  const setHover = useCallback(
    (i: number | null) => {
      if (i === null) {
        if (lastHover.current !== null) {
          audio.clearPreviewTarget({ kind: 'note', i: lastHover.current });
        }
      } else {
        noteHovered();
        audio.setPreviewTarget({ kind: 'note', i });
      }
      lastHover.current = i;
      dispatch({ type: 'hover', i });
    },
    [audio]
  );
  const setPin = useCallback((i: number | null) => dispatch({ type: 'pin', i }), []);
  const clickNote = useCallback(
    (i: number) =>
      dispatch({ type: 'sel/toggle', i, keepRoot: readDeveloperOptions().keepModeRoot }),
    [dispatch]
  );
  const pinNote = useCallback((i: number) => dispatch({ type: 'pin/toggle', i }), [dispatch]);

  const viz = useMemo<VizApi>(
    () => ({
      view: (id: VizId) => viewOf(state.layout, id),
      setView: (id: VizId, v: VizView) =>
        dispatch({ type: 'layout', fn: (l) => setView(l, id, v) }),
      settings: (id: VizId) => state.ui.viz[id],
      patch: (id: VizId, p: Partial<VizSettings>) => dispatch({ type: 'viz', id, patch: p }),
    }),
    [state.layout, state.ui.viz]
  );

  const soundingChords = useMemo<ReadonlySet<string>>(
    () => new Set(state.soundingChords),
    [state.soundingChords]
  );

  const lab = useMemo<Lab>(
    () => ({
      state,
      dispatch,
      tab,
      base,
      strip,
      an,
      hover: state.hover,
      pin: state.pin,
      setHover,
      setPin,
      chord,
      setChord: (s, pitches) => dispatch({ type: 'chord/hover', set: s, pitches }),
      chordHoverPitches: state.chordHoverPitches,
      pickChord: (s) => dispatch({ type: 'chord/pick', set: s }),
      chordPicked: state.chordPick,
      mode: tab.mode,
      setMode: (m) => dispatch({ type: 'mode/set', mode: m }),
      preview: state.preview,
      setPreview: (s) => dispatch({ type: 'preview', idx: s }),
      selected,
      sounding: state.sounding,
      soundingMarks: state.soundingMarks,
      soundingGhosts: state.soundingGhosts,
      soundingPitches: state.soundingPitches,
      soundingChords,
      clickNote,
      pinNote,
      audio,
      viz,
      frozen,
      storeFailed,
      owner,
      modified,
      updateBlocker,
      canUpdate: updateBlocker === null,
    }),
    [
      state,
      tab,
      base,
      strip,
      an,
      chord,
      selected,
      audio,
      viz,
      setHover,
      setPin,
      clickNote,
      pinNote,
      frozen,
      storeFailed,
      owner,
      modified,
      updateBlocker,
    ]
  );

  return <LabContext.Provider value={lab}>{children}</LabContext.Provider>;
}
