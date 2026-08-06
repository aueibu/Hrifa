import type { CSSVariablesResolver } from '@mantine/core';

export const semanticVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    '--accent': 'var(--mantine-primary-color-filled)',
    '--focus-ring': 'var(--mantine-primary-color-filled)',
    '--radius-panel': 'var(--mantine-radius-default)',
    '--shadow-panel': 'var(--mantine-shadow-xs)',
    '--surface': 'var(--mantine-color-body)',
    '--panel': 'var(--mantine-color-default)',
    '--panel-raised': 'var(--mantine-color-default)',
    '--panel-inset': 'var(--mantine-color-body)',
    '--border': 'var(--mantine-color-default-border)',
    '--text': 'var(--mantine-color-text)',
    '--text-muted': 'var(--mantine-color-dimmed)',
  },
  light: {},
  dark: {
    '--mantine-color-blue-light': 'var(--mantine-color-blue-9)',
    '--mantine-color-blue-light-hover': 'var(--mantine-color-blue-8)',
  },
});
