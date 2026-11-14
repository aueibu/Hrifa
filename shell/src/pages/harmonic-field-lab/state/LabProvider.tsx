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
import { useLabAudio } from '../audio/useLabAudio';
import { LabContext, type Analyses, type Lab, type VizApi } from './context';
import { chordModel, deriveBase, dissOf, edoOf, keysOf, spectrumOf, stripDevs } from './derive';
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
import {
  loadLayout,
  loadSettings,
  loadSubsets,
  loadTemplates,
  loadTabs,
  KEY_SUBSETS,
  saveLayout,
  saveSettings,
  saveSubsets,
  saveTemplates,
  saveTabs,
} from './persist';
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
  const saved = loadSubsets();
  const nextSaved = saved.length ? Math.max(...saved.map((s) => Number(s.id.slice(1)))) + 1 : 1;
  return {
    ...base,
    tabs,
    active,
    nextTab,
    saved,
    nextSaved,
    ui: loadSettings(),
    layout: loadLayout(),
    templates: loadTemplates(),
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
    if (store && state.saved !== restored.current.saved) {
      wrote('subsets', saveSubsets(state.saved));
    }
  }, [store, state.saved]);
  // another window saved subsets: take its list, so this window's next save cannot wipe them
  useEffect(() => {
    if (!store) {
      return;
    }
    const on = (e: StorageEvent) => {
      if (e.key === KEY_SUBSETS || e.key === null) {
        dispatch({ type: 'saved/sync', saved: loadSubsets() });
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

  const audio = useLabAudio({ enabled: !frozen, base, ui: state.ui, chord, dispatch });

  const setHover = useCallback((i: number | null) => dispatch({ type: 'hover', i }), []);
  const setPin = useCallback((i: number | null) => dispatch({ type: 'pin', i }), []);
  const clickNote = useCallback((i: number) => dispatch({ type: 'sel/toggle', i }), [dispatch]);
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
      setChord: (s) => dispatch({ type: 'chord/hover', set: s }),
      pickChord: (s) => dispatch({ type: 'chord/pick', set: s }),
      chordPicked: state.chordPick,
      mode: tab.mode,
      setMode: (m) => dispatch({ type: 'mode/set', mode: m }),
      preview: state.preview,
      setPreview: (s) => dispatch({ type: 'preview', idx: s }),
      selected,
      sounding: state.sounding,
      clickNote,
      pinNote,
      audio,
      viz,
      frozen,
      storeFailed,
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
    ]
  );

  return <LabContext.Provider value={lab}>{children}</LabContext.Provider>;
}
