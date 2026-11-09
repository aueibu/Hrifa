import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  createTheme,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Select,
  Switch,
  Textarea,
  TextInput,
} from '@mantine/core';

/**
 * Dense control sizing for the composition workbench only, in the spirit of a DAW: small buttons,
 * inputs and badges so more of the patch, inspector and module editor fit on screen at once.
 *
 * Applied with `MantineThemeProvider` around the workbench page, so it merges component defaults
 * into the app theme without touching colours, CSS variables or any other page. A component that
 * passes an explicit `size` keeps it.
 *
 * Corner radius is deliberately not set here: a nested provider cannot change Mantine's CSS
 * variables. The `.workbench` class in CompositionWorkbench.module.css owns every radius.
 */
export const compactWorkbenchTheme = createTheme({
  components: {
    Button: Button.extend({ defaultProps: { size: 'compact-xs' } }),
    ActionIcon: ActionIcon.extend({ defaultProps: { size: 'sm' } }),
    Badge: Badge.extend({ defaultProps: { size: 'sm' } }),
    TextInput: TextInput.extend({ defaultProps: { size: 'xs' } }),
    Textarea: Textarea.extend({ defaultProps: { size: 'xs' } }),
    NumberInput: NumberInput.extend({ defaultProps: { size: 'xs' } }),
    Select: Select.extend({ defaultProps: { size: 'xs' } }),
    MultiSelect: MultiSelect.extend({ defaultProps: { size: 'xs' } }),
    SegmentedControl: SegmentedControl.extend({ defaultProps: { size: 'xs' } }),
    Checkbox: Checkbox.extend({ defaultProps: { size: 'xs' } }),
    Switch: Switch.extend({ defaultProps: { size: 'xs' } }),
  },
});
