import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  createTheme,
  defaultVariantColorsResolver,
  MultiSelect,
  NumberInput,
  rem,
  SegmentedControl,
  Select,
  Switch,
  Table,
  Textarea,
  TextInput,
} from '@mantine/core';
import { markerPalettes } from './markers';
import type { ThemeTokens } from './tokens';

export function createAppTheme(tokens: ThemeTokens) {
  return createTheme({
    colors: {
      gray: tokens.gray,
      dark: tokens.dark,
      primary: tokens.primary,
      ...markerPalettes(tokens.markerHues, tokens.markerRamp),
    },
    primaryColor: 'primary',
    primaryShade: tokens.primaryShade,
    // The light variant is a neutral surface with a hint of the hue (see semantic.ts), so it takes the
    // same outline as a default button instead of Mantine's transparent border.
    variantColorResolver: (input) => {
      const colors = defaultVariantColorsResolver(input);
      return input.variant === 'light'
        ? { ...colors, border: `${rem(1)} solid var(--mantine-color-default-border)` }
        : colors;
    },
    white: tokens.white,
    black: tokens.black,
    fontFamily: 'Figtree, sans-serif',
    fontFamilyMonospace: '"DM Mono", monospace',
    headings: {
      fontFamily: 'Figtree, sans-serif',
      fontWeight: '600',
    },
    fontSizes: {
      xs: rem(11),
      sm: rem(12),
      md: rem(13),
      lg: rem(15),
      xl: rem(18),
    },
    lineHeights: {
      xs: '1.2',
      sm: '1.25',
      md: '1.3',
      lg: '1.35',
      xl: '1.4',
    },
    spacing: {
      xs: rem(4),
      sm: rem(6),
      md: rem(8),
      lg: rem(12),
      xl: rem(16),
    },
    radius: {
      xs: rem(2),
      sm: rem(3),
      md: rem(4),
      lg: rem(6),
      xl: rem(8),
    },
    defaultRadius: 'xs',
    components: {
      Button: Button.extend({ defaultProps: { size: 'sm' } }),
      ActionIcon: ActionIcon.extend({ defaultProps: { size: 'sm' } }),
      Badge: Badge.extend({ defaultProps: { size: 'xs' } }),
      TextInput: TextInput.extend({ defaultProps: { size: 'sm' } }),
      Textarea: Textarea.extend({ defaultProps: { size: 'sm' } }),
      NumberInput: NumberInput.extend({ defaultProps: { size: 'sm', hideControls: true } }),
      Select: Select.extend({ defaultProps: { size: 'sm' } }),
      MultiSelect: MultiSelect.extend({ defaultProps: { size: 'sm' } }),
      SegmentedControl: SegmentedControl.extend({ defaultProps: { size: 'sm' } }),
      Checkbox: Checkbox.extend({ defaultProps: { size: 'sm' } }),
      Switch: Switch.extend({ defaultProps: { size: 'sm' } }),
      Table: Table.extend({
        defaultProps: {
          striped: 'even',
          highlightOnHover: true,
          withRowBorders: false,
          tabularNums: true,
          verticalSpacing: 3,
          horizontalSpacing: 'sm',
        },
      }),
    },
  });
}
