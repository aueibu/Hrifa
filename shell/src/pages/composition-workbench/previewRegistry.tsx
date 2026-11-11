import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

// Lets the header transport's Play button (and the space bar) start the selected module's own
// preview. Each module with a preview registers its play function under its instance id; the
// transport looks up whichever module is selected.
interface PreviewRegistry {
  register(instanceId: string, play: () => void): () => void;
  get(instanceId: string | null | undefined): (() => void) | undefined;
  subscribe(listener: () => void): () => void;
  version(): number;
}

function createPreviewRegistry(): PreviewRegistry {
  const actions = new Map<string, () => void>();
  const listeners = new Set<() => void>();
  let version = 0;
  const changed = () => {
    version += 1;
    listeners.forEach((listener) => listener());
  };
  return {
    register(instanceId, play) {
      actions.set(instanceId, play);
      changed();
      return () => {
        if (actions.get(instanceId) === play) {
          actions.delete(instanceId);
          changed();
        }
      };
    },
    get: (instanceId) => (instanceId ? actions.get(instanceId) : undefined),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    version: () => version,
  };
}

const PreviewRegistryContext = createContext<PreviewRegistry | null>(null);

export function PreviewRegistryProvider({ children }: { children: ReactNode }) {
  const registry = useRef<PreviewRegistry | null>(null);
  registry.current ??= createPreviewRegistry();
  return (
    <PreviewRegistryContext.Provider value={registry.current}>
      {children}
    </PreviewRegistryContext.Provider>
  );
}

/** Registers a module's main preview so the header transport can start it. */
export function useTransportPreview(instanceId: string, play: () => void) {
  const registry = useContext(PreviewRegistryContext);
  const latest = useRef(play);
  latest.current = play;
  useEffect(() => registry?.register(instanceId, () => latest.current()), [registry, instanceId]);
}

/** The selected module's preview, or undefined when it has none. */
export function useRegisteredPreview(instanceId: string | null | undefined) {
  const registry = useContext(PreviewRegistryContext);
  useSyncExternalStore(registry?.subscribe ?? (() => () => {}), registry?.version ?? (() => 0));
  return registry?.get(instanceId);
}
