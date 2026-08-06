import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  ColorInput,
  ColorPicker,
  FileInput,
  Group,
  MantineProvider,
  SegmentedControl,
  SimpleGrid,
  Slider,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  type MantineColorsTuple,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { Surface } from '../components/Surface/Surface';
import { createAppTheme } from '../theme';
import { semanticVariablesResolver } from '../theme/semantic';
import { useThemeEditor } from '../theme/ThemeProvider';
import { isThemeTokens, neutralScaleSteps, type ThemeTokens } from '../theme/tokens';

type Palette = 'gray' | 'dark';
type EditorTarget = { palette: Palette; index: number } | { palette: 'white' | 'black' };

interface HslColor {
  h: number;
  s: number;
  l: number;
}

const stockRoles = {
  light: [
    ['Page', 'white'],
    ['Panel / card', 'white'],
    ['Hover', 'gray-0'],
    ['Border', 'gray-4'],
    ['Text', 'black'],
    ['Muted text', 'gray-6'],
    ['Placeholder / disabled text', 'gray-5'],
    ['Disabled surface', 'gray-2'],
    ['Disabled border', 'gray-3'],
  ],
  dark: [
    ['Page', 'dark-7'],
    ['Panel / card', 'dark-6'],
    ['Hover', 'dark-5'],
    ['Border', 'dark-4'],
    ['Text', 'dark-0'],
    ['Muted text', 'dark-2'],
    ['Placeholder / disabled text', 'dark-3'],
    ['Disabled surface', 'dark-6'],
    ['Disabled border', 'dark-4'],
  ],
} as const;

function hexToHsl(hex: string): HslColor {
  const value =
    hex.length === 4
      ? `#${hex
          .slice(1)
          .split('')
          .map((part) => part.repeat(2))
          .join('')}`
      : hex;
  const [red, green, blue] = [value.slice(1, 3), value.slice(3, 5), value.slice(5, 7)].map(
    (part) => Number.parseInt(part, 16) / 255
  );
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const lightness = (maximum + minimum) / 2;
  if (maximum === minimum) {
    return { h: 0, s: 0, l: lightness * 100 };
  }
  const difference = maximum - minimum;
  const hue =
    maximum === red
      ? ((green - blue) / difference) % 6
      : maximum === green
        ? (blue - red) / difference + 2
        : (red - green) / difference + 4;
  return {
    h: (hue * 60 + 360) % 360,
    s: (difference / (1 - Math.abs(2 * lightness - 1))) * 100,
    l: lightness * 100,
  };
}

function hslToHex({ h, s, l }: HslColor): string {
  const chroma = (1 - Math.abs(2 * (l / 100) - 1)) * (s / 100);
  const segment = h / 60;
  const second = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = l / 100 - chroma / 2;
  const [red, green, blue] =
    segment < 1
      ? [chroma, second, 0]
      : segment < 2
        ? [second, chroma, 0]
        : segment < 3
          ? [0, chroma, second]
          : segment < 4
            ? [0, second, chroma]
            : segment < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const toHex = (color: number) =>
    Math.round((color + match) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function tokenValue(tokens: ThemeTokens, reference: string) {
  if (reference === 'white' || reference === 'black') {
    return tokens[reference];
  }
  const [palette, index] = reference.split('-') as [Palette, string];
  return tokens[palette][Number(index)];
}

function ThemePreview({ scheme }: { scheme: 'light' | 'dark' }) {
  const { draft } = useThemeEditor();
  const previewTheme = useMemo(() => createAppTheme(draft), [draft]);
  const sourceFor = (role: string) => stockRoles[scheme].find(([name]) => name === role)?.[1];
  return (
    <MantineProvider
      theme={previewTheme}
      cssVariablesResolver={semanticVariablesResolver}
      forceColorScheme={scheme}
    >
      <Stack
        bg="var(--surface)"
        p="md"
        gap="sm"
        style={{ borderRadius: 'var(--mantine-radius-sm)' }}
      >
        <Text fw={700} size="sm">
          {scheme === 'light' ? 'Light' : 'Dark'} preview
        </Text>
        <Surface p="sm">
          <Text fw={600}>Panel</Text>
          <Text size="sm" mt="xs">
            Readable panel content — text: {sourceFor('Text')}
          </Text>
          <Text c="dimmed" size="sm">
            Supporting context — muted text: {sourceFor('Muted text')}
          </Text>
          <Stack gap={0} mt="xs">
            {stockRoles[scheme].map(([role, source]) => (
              <Text key={role} c="var(--text-muted)" size="xs">
                {role}: {source} · {tokenValue(draft, source)}
              </Text>
            ))}
          </Stack>
        </Surface>
        <TextInput
          label={
            <Stack gap={0}>
              <Text size="sm">Empty field</Text>
              <Text size="xs">Placeholder: {sourceFor('Placeholder / disabled text')}</Text>
            </Stack>
          }
          placeholder="Placeholder text"
        />
        <TextInput
          label={
            <Stack gap={0}>
              <Text size="sm">Disabled field</Text>
              <Text size="xs">Disabled text: {sourceFor('Placeholder / disabled text')}</Text>
              <Text size="xs">Disabled surface: {sourceFor('Disabled surface')}</Text>
              <Text size="xs">Disabled border: {sourceFor('Disabled border')}</Text>
            </Stack>
          }
          value="Disabled text"
          disabled
          readOnly
        />
        <Group gap="xs">
          <Button size="xs">Action</Button>
          <Stack gap={0}>
            <Button size="xs" variant="default">
              Secondary
            </Button>
            <Text size="xs">Hover: {sourceFor('Hover')}</Text>
          </Stack>
          <Stack gap={0}>
            <Button size="xs" variant="default" disabled>
              Disabled
            </Button>
            <Text size="xs">Disabled surface: {sourceFor('Disabled surface')}</Text>
            <Text size="xs">Disabled text: {sourceFor('Placeholder / disabled text')}</Text>
            <Text size="xs">Disabled border: {sourceFor('Disabled border')}</Text>
          </Stack>
          <Badge variant="light">Status</Badge>
        </Group>
        <Alert title="Feedback" p="sm">
          Alert treatment
        </Alert>
        <Card withBorder padding="sm">
          <Text fw={600}>Card</Text>
          <Text c="dimmed" size="sm">
            Existing Mantine card
          </Text>
        </Card>
      </Stack>
    </MantineProvider>
  );
}

export function ThemeEditorPage() {
  const { applied, apply, draft, reset, setDraft } = useThemeEditor();
  const { setColorScheme } = useMantineColorScheme();
  const editorScheme = useComputedColorScheme('light');
  const [target, setTarget] = useState<EditorTarget>({ palette: 'gray', index: 0 });
  const [hexList, setHexList] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const targetColor =
    'index' in target ? draft[target.palette][target.index] : draft[target.palette];
  const targetHsl = hexToHsl(targetColor);
  const [sliderHsl, setSliderHsl] = useState(targetHsl);
  const targetLabel = 'index' in target ? `${target.palette}-${target.index}` : target.palette;
  useEffect(() => {
    setSliderHsl(hexToHsl(targetColor));
  }, [targetLabel]);
  const updateTarget = (color: string) => {
    if (!('index' in target)) {
      setDraft({ ...draft, [target.palette]: color });
    } else {
      const colors = [...draft[target.palette]];
      colors[target.index] = color;
      setDraft({ ...draft, [target.palette]: colors as unknown as MantineColorsTuple });
    }
  };
  const updateHsl = (channel: keyof HslColor, value: number) => {
    const next = { ...sliderHsl, [channel]: value };
    setSliderHsl(next);
    updateTarget(hslToHex(next));
  };
  const updatePicker = (color: string) => {
    setSliderHsl(hexToHsl(color));
    updateTarget(color);
  };
  const select = (palette: Palette, index: number) => setTarget({ palette, index });
  const allSwatches = [...draft.gray, ...draft.dark, draft.white, draft.black];

  function importHexList() {
    const declarations = [
      ...hexList.matchAll(/--color-(gray|dark)-(\d+)\s*:\s*(#[\da-f]{3,6})\s*;?/gi),
    ];
    const isHex = (value: string) => /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value);
    if (declarations.length) {
      const next = { ...draft };
      for (const palette of ['gray', 'dark'] as const) {
        const entries = declarations.filter(([, found]) => found.toLowerCase() === palette);
        if (!entries.length) {
          continue;
        }
        const byIndex = new Map(entries.map(([, , step, color]) => [Number(step), color]));
        const colors = neutralScaleSteps.map(
          (step, index) => byIndex.get(step) ?? byIndex.get(index) ?? ''
        );
        if (!colors.every(isHex)) {
          setImportError(`Paste all ten ${palette} values (50–900 or 0–9).`);
          return;
        }
        next[palette] = colors as unknown as MantineColorsTuple;
      }
      setDraft(next);
      setImportError(null);
      return;
    }
    const colors = hexList
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean);
    if (
      colors.length !== 10 ||
      !colors.every(isHex) ||
      target.palette === 'white' ||
      target.palette === 'black'
    ) {
      setImportError(
        'Paste all ten gray or dark declarations, or select a gray/dark value before pasting ten bare hex colors.'
      );
      return;
    }
    setDraft({ ...draft, [target.palette]: colors as unknown as MantineColorsTuple });
    setImportError(null);
  }

  async function importJson(file: File | null) {
    if (!file) {
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isThemeTokens(parsed)) {
        throw new Error(
          'Expected a complete theme export with white, black, gray, and dark values.'
        );
      }
      setDraft(parsed);
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Could not read this theme file.');
    }
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'shell-theme-tokens.json';
    link.click();
    URL.revokeObjectURL(url);
  }
  const dirty = JSON.stringify(applied) !== JSON.stringify(draft);

  return (
    <Stack maw={1180} mx="auto" p="md" gap="xl">
      <Anchor component={Link} to="/" size="sm">
        ← Back to workbench
      </Anchor>
      <Group justify="space-between" align="start">
        <Stack gap={2}>
          <Title order={1}>Theme editor</Title>
          <Text c="dimmed">
            Edit Mantine’s actual stock neutral tokens. Its stock role mapping remains intact.
          </Text>
        </Stack>
        <SegmentedControl
          aria-label="Editor color scheme"
          data={[
            { label: 'Light', value: 'light' },
            { label: 'Dark', value: 'dark' },
          ]}
          value={editorScheme}
          onChange={(value) => {
            const palette: Palette = value === 'dark' ? 'dark' : 'gray';
            setColorScheme(value as 'light' | 'dark');
            setTarget({ palette, index: 0 });
          }}
        />
      </Group>
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
        <Stack gap="md">
          <Stack display="none">
            <Title order={2} size="h3">
              Stock Mantine neutral tokens
            </Title>
            <Text size="sm" c="dimmed">
              Gray and dark are Mantine’s actual 0–9 palettes. The pasted 50–900 scale maps directly
              to 0–9.
            </Text>
            <Group grow>
              <ColorInput
                label="white"
                value={draft.white}
                format="hex"
                withPicker={false}
                withEyeDropper={false}
                onChange={(white) => setDraft({ ...draft, white })}
                onFocus={() => setTarget({ palette: 'white' })}
              />
              <ColorInput
                label="black"
                value={draft.black}
                format="hex"
                withPicker={false}
                withEyeDropper={false}
                onChange={(black) => setDraft({ ...draft, black })}
                onFocus={() => setTarget({ palette: 'black' })}
              />
            </Group>
            {(['gray', 'dark'] as const).map((palette) => (
              <Stack key={palette} gap="xs">
                <Text fw={600}>{palette}</Text>
                {draft[palette].map((color, index) => (
                  <ColorInput
                    key={index}
                    label={`${palette}-${index} (${neutralScaleSteps[index]})`}
                    value={color}
                    format="hex"
                    withPicker={false}
                    withEyeDropper={false}
                    onFocus={() => select(palette, index)}
                    onClick={() => select(palette, index)}
                    onChange={(value) => {
                      const next = [...draft[palette]];
                      next[index] = value;
                      setDraft({ ...draft, [palette]: next as unknown as MantineColorsTuple });
                    }}
                  />
                ))}
              </Stack>
            ))}
          </Stack>
          <Surface p="md">
            <Stack gap="md">
              <div>
                <Text fw={600}>Editing {targetLabel}</Text>
                <Text size="sm" c="dimmed">
                  Large picker and HSL controls.
                </Text>
              </div>
              <ColorInput
                label="Pick from screen"
                description="Use the eyedropper to sample any visible color."
                value={targetColor}
                onChange={updatePicker}
                format="hex"
                withPicker={false}
                withEyeDropper
              />
              <ColorPicker
                value={targetColor}
                onChange={updatePicker}
                format="hex"
                size="xl"
                fullWidth
                swatches={allSwatches}
                swatchesPerRow={11}
              />
              <Text size="sm">Hue: {targetHsl.h}°</Text>
              <Slider
                value={sliderHsl.h}
                onChange={(value) => updateHsl('h', value)}
                min={0}
                max={360}
                step={0.1}
                aria-label="Hue"
              />
              <Text size="sm">Saturation: {targetHsl.s}%</Text>
              <Slider
                value={sliderHsl.s}
                onChange={(value) => updateHsl('s', value)}
                min={0}
                max={100}
                step={0.1}
                aria-label="Saturation"
              />
              <Text size="sm">Lightness: {targetHsl.l}%</Text>
              <Slider
                value={sliderHsl.l}
                onChange={(value) => updateHsl('l', value)}
                min={0}
                max={100}
                step={0.1}
                aria-label="Lightness"
              />
            </Stack>
          </Surface>
          <Group>
            <Button onClick={apply}>
              {dirty ? 'Apply on this device' : 'Applied on this device'}
            </Button>
            <Button variant="default" onClick={reset}>
              Restore Mantine defaults
            </Button>
            <Button variant="subtle" onClick={exportJson}>
              Export JSON
            </Button>
          </Group>
          <Textarea
            label="Replace gray or dark palette"
            description="Paste --color-gray-50 … --color-gray-900 or the equivalent dark declarations. Bare lists replace the selected palette."
            placeholder={
              '--color-gray-900: #111212;\n--color-gray-800: #1f2020;\n…\n--color-gray-50: #f5f8f8;'
            }
            value={hexList}
            onChange={(event) => setHexList(event.currentTarget.value)}
            autosize
            minRows={4}
          />
          <Button variant="default" onClick={importHexList}>
            Load palette
          </Button>
          <FileInput
            label="Import complete theme JSON"
            placeholder="Choose an exported token file"
            accept="application/json,.json"
            clearable
            onChange={importJson}
          />
          {importError && (
            <Alert color="red" title="Could not import theme">
              {importError}
            </Alert>
          )}
          {dirty && (
            <Alert color="blue" title="Draft only">
              The preview uses this draft. Apply it to use the values throughout the shell on this
              device.
            </Alert>
          )}
        </Stack>
        <Stack gap="md">
          <Title order={2} size="h3">
            Stock Mantine tokens
          </Title>
          <Text size="sm" c="dimmed">
            Light tokens sit below white; dark tokens sit below black.
          </Text>
          <SimpleGrid cols={2} spacing="sm">
            <Stack gap="xs">
              <ColorInput
                label="white"
                value={draft.white}
                format="hex"
                withPicker={false}
                withEyeDropper={false}
                onChange={(white) => setDraft({ ...draft, white })}
                onFocus={() => setTarget({ palette: 'white' })}
              />
              <Text fw={600} size="sm">
                Light theme — gray
              </Text>
              {draft.gray.map((color, index) => (
                <ColorInput
                  key={index}
                  label={`gray-${index} (${neutralScaleSteps[index]})`}
                  value={color}
                  format="hex"
                  withPicker={false}
                  withEyeDropper={false}
                  onFocus={() => select('gray', index)}
                  onClick={() => select('gray', index)}
                  onChange={(value) => {
                    const next = [...draft.gray];
                    next[index] = value;
                    setDraft({ ...draft, gray: next as unknown as MantineColorsTuple });
                  }}
                />
              ))}
            </Stack>
            <Stack gap="xs">
              <ColorInput
                label="black"
                value={draft.black}
                format="hex"
                withPicker={false}
                withEyeDropper={false}
                onChange={(black) => setDraft({ ...draft, black })}
                onFocus={() => setTarget({ palette: 'black' })}
              />
              <Text fw={600} size="sm">
                Dark theme — dark
              </Text>
              {draft.dark.map((color, index) => (
                <ColorInput
                  key={index}
                  label={`dark-${index} (${neutralScaleSteps[index]})`}
                  value={color}
                  format="hex"
                  withPicker={false}
                  withEyeDropper={false}
                  onFocus={() => select('dark', index)}
                  onClick={() => select('dark', index)}
                  onChange={(value) => {
                    const next = [...draft.dark];
                    next[index] = value;
                    setDraft({ ...draft, dark: next as unknown as MantineColorsTuple });
                  }}
                />
              ))}
            </Stack>
          </SimpleGrid>
        </Stack>
        <Stack gap="md">
          <Title order={2} size="h3">
            Current theme preview
          </Title>
          <ThemePreview scheme={editorScheme} />
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}
