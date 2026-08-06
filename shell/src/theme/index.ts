import { DEFAULT_THEME, mergeMantineTheme } from '@mantine/core';
import { createAppTheme } from './foundation';
import { defaultThemeTokens } from './tokens';

/** Static theme used by Storybook and tests. The application can replace tokens locally. */
export const theme = mergeMantineTheme(DEFAULT_THEME, createAppTheme(defaultThemeTokens));
export { createAppTheme } from './foundation';
export { defaultThemeTokens } from './tokens';
