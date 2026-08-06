import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { createAppTheme } from './foundation';
import { semanticVariablesResolver } from './semantic';
import {
  defaultThemeTokens,
  loadThemeTokens,
  themeTokensStorageKey,
  type ThemeTokens,
} from './tokens';

interface ThemeEditorState {
  applied: ThemeTokens;
  draft: ThemeTokens;
  setDraft: (tokens: ThemeTokens) => void;
  apply: () => void;
  reset: () => void;
}

const ThemeEditorContext = createContext<ThemeEditorState | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [applied, setApplied] = useState(loadThemeTokens);
  const [draft, setDraft] = useState(applied);
  const theme = useMemo(() => createAppTheme(applied), [applied]);

  function apply() {
    setApplied(draft);
    try {
      localStorage.setItem(themeTokensStorageKey, JSON.stringify(draft));
    } catch {
      // The live session still receives the applied draft.
    }
  }

  function reset() {
    setDraft(defaultThemeTokens);
    setApplied(defaultThemeTokens);
    try {
      localStorage.removeItem(themeTokensStorageKey);
    } catch {
      // The source baseline still applies in this session.
    }
  }

  return (
    <ThemeEditorContext.Provider value={{ applied, draft, setDraft, apply, reset }}>
      <MantineProvider theme={theme} cssVariablesResolver={semanticVariablesResolver}>
        {children}
      </MantineProvider>
    </ThemeEditorContext.Provider>
  );
}

export function useThemeEditor() {
  const context = useContext(ThemeEditorContext);
  if (!context) {
    throw new Error('useThemeEditor must be used inside AppThemeProvider');
  }
  return context;
}
