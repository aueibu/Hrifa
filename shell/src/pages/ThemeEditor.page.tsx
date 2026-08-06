import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  ColorInput,
  ColorPicker,
  FileInput,
  Group,
  Loader,
  MantineProvider,
  Modal,
  Progress,
  Radio,
  SegmentedControl,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Tabs,
  ThemeIcon,
  Title,
  type MantineColorsTuple,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { Surface } from '../components/Surface/Surface';
import { createAppTheme } from '../theme';
import { apcaAssessment, apcaContrast, formatApcaContrast } from '../theme/contrast';
import {
  markerColor,
  markerColorNames,
  markerHueCollisions,
  markerPalette,
  nudgeMarkerHue,
  type MarkerColorName,
  type MarkerHues,
  type MarkerRamp,
} from '../theme/markers';
import { semanticVariablesResolver } from '../theme/semantic';
import { useThemeEditor } from '../theme/ThemeProvider';
import {
  isThemeTokens,
  neutralScaleSteps,
  normalizeThemeTokens,
  type ColorShade,
  type PrimaryRamp,
  type ThemeTokens,
} from '../theme/tokens';

type Palette = 'gray' | 'dark' | 'primary';
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

function deriveColorRamp({
  core,
  contrast,
  curve,
  endpointChroma,
}: PrimaryRamp): MantineColorsTuple {
  const { h, s, l } = hexToHsl(core);
  const exponent = curve === 'soft' ? 0.75 : curve === 'dramatic' ? 1.4 : 1;
  const contrastMultiplier = contrast / 100;
  const chromaAtEndpoint = endpointChroma / 100;

  return Array.from({ length: 10 }, (_, index) => {
    const distance = index < 6 ? (6 - index) / 6 : (index - 6) / 3;
    const shapedDistance = distance ** exponent;
    const lightnessRange = index < 6 ? Math.min(98 - l, 46) : Math.min(l - 4, 22);
    const lightness =
      index < 6
        ? l + lightnessRange * contrastMultiplier * shapedDistance
        : l - lightnessRange * contrastMultiplier * shapedDistance;

    return hslToHex({
      h,
      s: Math.min(100, s * (1 - (1 - chromaAtEndpoint) * distance)),
      l: Math.max(4, Math.min(98, lightness)),
    });
  }) as unknown as MantineColorsTuple;
}

function tokenValue(tokens: ThemeTokens, reference: string) {
  if (reference === 'white' || reference === 'black') {
    return tokens[reference];
  }
  const [palette, index] = reference.split('-') as [Palette, string];
  return tokens[palette][Number(index)];
}

interface ContrastPair {
  label: string;
  text: string;
  background: string;
}

function ContrastReadout({ pairs, title }: { pairs: ContrastPair[]; title: string }) {
  return (
    <Stack gap={4}>
      <Text fw={600} size="sm">
        {title}
      </Text>
      {pairs.map((pair) => {
        const contrast = apcaContrast(pair.text, pair.background);
        return (
          <Group key={pair.label} justify="space-between" gap="xs" wrap="nowrap">
            <Text size="xs">{pair.label}</Text>
            <Badge variant="light" size="sm">
              {formatApcaContrast(contrast)} · {apcaAssessment(contrast)}
            </Badge>
          </Group>
        );
      })}
      <Text c="dimmed" size="xs">
        Signed Lc: positive is dark-on-light; negative is light-on-dark.{' '}
        <Anchor href="https://git.apcacontrast.com/documentation/" target="_blank" rel="noreferrer">
          About APCA
        </Anchor>
      </Text>
    </Stack>
  );
}

function neutralContrastPairs(tokens: ThemeTokens, scheme: 'light' | 'dark'): ContrastPair[] {
  if (scheme === 'light') {
    return [
      { label: 'Main text on page', text: tokens.black, background: tokens.white },
      { label: 'Muted text on page', text: tokens.gray[6], background: tokens.white },
      { label: 'Main text on hover', text: tokens.black, background: tokens.gray[0] },
      {
        label: 'Disabled text on disabled surface',
        text: tokens.gray[5],
        background: tokens.gray[2],
      },
    ];
  }

  return [
    { label: 'Main text on page', text: tokens.dark[0], background: tokens.dark[7] },
    { label: 'Muted text on page', text: tokens.dark[2], background: tokens.dark[7] },
    { label: 'Main text on hover', text: tokens.dark[0], background: tokens.dark[5] },
    {
      label: 'Disabled text on disabled surface',
      text: tokens.dark[3],
      background: tokens.dark[6],
    },
  ];
}

function interactionContrastPairs(tokens: ThemeTokens, scheme: 'light' | 'dark'): ContrastPair[] {
  const active = tokens.primary[tokens.primaryShade[scheme]];
  const page = scheme === 'light' ? tokens.white : tokens.dark[7];

  return [
    { label: 'Filled action text', text: tokens.white, background: active },
    { label: 'Link / focus on page', text: active, background: page },
    { label: 'Selected control text', text: tokens.white, background: active },
  ];
}

function MarkerWheel({ hues, ramp }: { hues: MarkerHues; ramp: MarkerRamp }) {
  const orderedColors = [...markerColorNames].sort((left, right) => hues[left] - hues[right]);
  const first = orderedColors[0];
  const last = orderedColors.at(-1)!;
  const segments = [
    `${markerColor(hues[last], ramp)} ${hues[last] - 360}deg`,
    ...orderedColors.map((name) => `${markerColor(hues[name], ramp)} ${hues[name]}deg`),
    `${markerColor(hues[first], ramp)} ${hues[first] + 360}deg`,
  ].join(', ');

  return (
    <div
      aria-label="Marker hue wheel"
      style={{
        aspectRatio: '1',
        background: `conic-gradient(${segments})`,
        borderRadius: '50%',
        maxWidth: 360,
        position: 'relative',
        width: '100%',
      }}
    >
      <div
        style={{
          background: 'var(--panel)',
          borderRadius: '50%',
          inset: '27%',
          position: 'absolute',
        }}
      />
      {markerColorNames.map((name) => {
        const angle = ((hues[name] - 90) * Math.PI) / 180;
        return (
          <Text
            key={name}
            fw={700}
            size="xs"
            style={{
              left: `${50 + Math.cos(angle) * 43}%`,
              position: 'absolute',
              textShadow: '0 1px 2px var(--panel)',
              top: `${50 + Math.sin(angle) * 43}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {name}
          </Text>
        );
      })}
    </div>
  );
}

function MarkerRampSwatches({ hues, ramp }: { hues: MarkerHues; ramp: MarkerRamp }) {
  return (
    <Stack gap="xs" w="100%">
      <Text fw={600} size="sm">
        Shared OKLCH ramps
      </Text>
      {markerColorNames.map((name) => (
        <div
          key={name}
          style={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: '72px repeat(10, minmax(0, 1fr))',
          }}
        >
          <Text size="xs">{name}</Text>
          {markerPalette(hues[name], ramp).map((color, index) => (
            <div
              key={index}
              aria-label={`${name}-${index}`}
              role="img"
              style={{
                aspectRatio: '1',
                background: color,
                borderRadius: 'var(--mantine-radius-xs)',
                minHeight: 16,
              }}
              title={`${name}-${index}: ${color}`}
            />
          ))}
        </div>
      ))}
      <Text c="dimmed" size="xs">
        0 is lightest; 9 is darkest. Each column shares the same perceptual lightness and chroma
        target across families.
      </Text>
    </Stack>
  );
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
        <ContrastReadout
          pairs={neutralContrastPairs(draft, scheme)}
          title="APCA semantic contrast"
        />
      </Stack>
    </MantineProvider>
  );
}

interface ColorPickerPanelProps {
  targetColor: string;
  targetHsl: HslColor;
  targetLabel: string;
  sliderHsl: HslColor;
  swatches: string[];
  onChange: (color: string) => void;
  onHslChange: (channel: keyof HslColor, value: number) => void;
}

function ColorPickerPanel({
  targetColor,
  targetHsl,
  targetLabel,
  sliderHsl,
  swatches,
  onChange,
  onHslChange,
}: ColorPickerPanelProps) {
  const controls: Array<{ channel: keyof HslColor; label: string; max: number; suffix: string }> = [
    { channel: 'h', label: 'Hue', max: 360, suffix: '°' },
    { channel: 's', label: 'Saturation', max: 100, suffix: '%' },
    { channel: 'l', label: 'Lightness', max: 100, suffix: '%' },
  ];

  return (
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
          onChange={onChange}
          format="hex"
          withPicker={false}
          withEyeDropper
        />
        <ColorPicker
          key={targetLabel}
          value={targetColor}
          onChange={onChange}
          format="hex"
          size="xl"
          fullWidth
          swatches={swatches}
          swatchesPerRow={11}
        />
        {controls.map(({ channel, label, max, suffix }) => (
          <Stack key={channel} gap={4}>
            <Text size="sm">
              {label}: {targetHsl[channel].toFixed(1)}
              {suffix}
            </Text>
            <Slider
              value={sliderHsl[channel]}
              onChange={(value) => onHslChange(channel, value)}
              min={0}
              max={max}
              step={0.1}
              aria-label={label}
            />
          </Stack>
        ))}
      </Stack>
    </Surface>
  );
}

export function ThemeEditorPage() {
  const { applied, apply, draft, reset, setDraft } = useThemeEditor();
  const { setColorScheme } = useMantineColorScheme();
  const editorScheme = useComputedColorScheme('light');
  const [target, setTarget] = useState<EditorTarget>({ palette: 'gray', index: 0 });
  const [activeTab, setActiveTab] = useState<'neutrals' | 'interaction' | 'markers' | 'manage'>(
    'neutrals'
  );
  const [hexList, setHexList] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [resetModalOpened, setResetModalOpened] = useState(false);
  const [applyModalOpened, setApplyModalOpened] = useState(false);

  const targetColor =
    'index' in target ? draft[target.palette][target.index] : draft[target.palette];
  const targetHsl = hexToHsl(targetColor);
  const [sliderHsl, setSliderHsl] = useState(targetHsl);
  const targetLabel = 'index' in target ? `${target.palette}-${target.index}` : target.palette;
  useEffect(() => {
    setSliderHsl(hexToHsl(targetColor));
  }, [targetColor]);
  const updateTarget = (color: string) => {
    if (!('index' in target)) {
      setDraft({ ...draft, [target.palette]: color });
    } else {
      if (target.palette === 'primary') {
        const primaryRamp = { ...draft.primaryRamp, core: color };
        setDraft({ ...draft, primaryRamp, primary: deriveColorRamp(primaryRamp) });
        return;
      }
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
  const updatePrimaryRamp = (changes: Partial<Omit<PrimaryRamp, 'core'>>) => {
    const primaryRamp = { ...draft.primaryRamp, ...changes };
    setDraft({ ...draft, primaryRamp, primary: deriveColorRamp(primaryRamp) });
  };
  const selectInteractionCore = () => {
    setTarget({ palette: 'primary', index: 6 });
    setSliderHsl(hexToHsl(draft.primary[6]));
  };
  const updateMarkerHue = (name: MarkerColorName, hue: number) => {
    setDraft({ ...draft, markerHues: { ...draft.markerHues, [name]: hue } });
  };
  const updateMarkerRamp = (changes: Partial<MarkerRamp>) => {
    setDraft({ ...draft, markerRamp: { ...draft.markerRamp, ...changes } });
  };
  const confirmReset = () => {
    reset();
    setResetModalOpened(false);
  };
  const select = (palette: Palette, index: number) => setTarget({ palette, index });
  const allSwatches = [...draft.gray, ...draft.dark, ...draft.primary, draft.white, draft.black];
  const primarySwatches = [...draft.primary];
  const markerCollisions = markerHueCollisions(draft.markerHues);

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

  function parseThemeJson(source: string): ThemeTokens {
    const parsed: unknown = JSON.parse(source);
    if (!isThemeTokens(parsed)) {
      throw new Error('Expected a complete theme export with white, black, gray, and dark values.');
    }
    return normalizeThemeTokens(parsed);
  }

  async function importJson(file: File | null) {
    if (!file) return;
    try {
      const tokens = parseThemeJson(await file.text());
      setDraft(tokens);
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
  const activePrimaryShade = draft.primaryShade[editorScheme];
  const interactionVariantLines =
    editorScheme === 'light'
      ? [
          `Filled: primary-${activePrimaryShade}`,
          `Filled hover: primary-${Math.min(activePrimaryShade + 1, 8)}`,
          'Light: background primary-1',
          'Light hover: primary-2',
          'Light text: primary-9',
          `Outline: border and text primary-${activePrimaryShade}`,
          'Subtle: text primary-9; hover primary-2',
          'Transparent: text primary-9',
        ]
      : [
          `Filled: primary-${activePrimaryShade}`,
          `Filled hover: primary-${Math.min(activePrimaryShade + 1, 8)}`,
          'Light/subtle background: darken(primary-9, 50%)',
          'Light/subtle hover: darken(primary-9, 30%)',
          'Light/subtle text: primary-0',
          `Outline: border and text primary-${Math.max(activePrimaryShade - 4, 0)}`,
          'Transparent: text primary-0',
        ];

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
            if (activeTab === 'interaction') {
              selectInteractionCore();
            } else if (activeTab === 'neutrals') {
              setTarget({ palette, index: 0 });
            }
          }}
        />
      </Group>
      <Tabs
        value={activeTab}
        onChange={(tab) => {
          if (tab === 'interaction') {
            setActiveTab(tab);
            selectInteractionCore();
          } else if (tab === 'neutrals') {
            setActiveTab(tab);
            setTarget({ palette: editorScheme === 'dark' ? 'dark' : 'gray', index: 0 });
          } else if (tab === 'markers' || tab === 'manage') {
            setActiveTab(tab);
          }
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="neutrals">Neutrals</Tabs.Tab>
          <Tabs.Tab value="interaction">Interaction</Tabs.Tab>
          <Tabs.Tab value="markers">Markers</Tabs.Tab>
          <Tabs.Tab value="manage">Theme management</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="neutrals" pt="md">
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
            <Stack gap="md">
              <Stack display="none">
                <Title order={2} size="h3">
                  Stock Mantine neutral tokens
                </Title>
                <Text size="sm" c="dimmed">
                  Gray and dark are Mantine’s actual 0–9 palettes. The pasted 50–900 scale maps
                  directly to 0–9.
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
              <ColorPickerPanel
                targetColor={targetColor}
                targetHsl={targetHsl}
                targetLabel={targetLabel}
                sliderHsl={sliderHsl}
                swatches={allSwatches}
                onChange={updatePicker}
                onHslChange={updateHsl}
              />
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
        </Tabs.Panel>
        <Tabs.Panel value="interaction" pt="md">
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
            <ColorPickerPanel
              targetColor={targetColor}
              targetHsl={targetHsl}
              targetLabel={targetLabel}
              sliderHsl={sliderHsl}
              swatches={primarySwatches}
              onChange={updatePicker}
              onHslChange={updateHsl}
            />
            <Stack gap="sm">
              <Title order={2} size="h3">
                Derived interaction ramp
              </Title>
              <Text size="sm" c="dimmed">
                Edit core primary-6 with the picker. The remaining shades are derived to preserve
                one coherent interaction family.
              </Text>
              <Stack gap={4}>
                <Text size="sm">Contrast: {draft.primaryRamp.contrast}%</Text>
                <Slider
                  value={draft.primaryRamp.contrast}
                  onChange={(contrast) => updatePrimaryRamp({ contrast })}
                  min={50}
                  max={150}
                  step={1}
                  aria-label="Ramp contrast"
                />
              </Stack>
              <Select
                label="Lightness curve"
                value={draft.primaryRamp.curve}
                data={[
                  { value: 'even', label: 'Even' },
                  { value: 'soft', label: 'Soft ends' },
                  { value: 'dramatic', label: 'Dramatic ends' },
                ]}
                onChange={(curve) =>
                  curve && updatePrimaryRamp({ curve: curve as PrimaryRamp['curve'] })
                }
              />
              <Stack gap={4}>
                <Text size="sm">Endpoint chroma: {draft.primaryRamp.endpointChroma}%</Text>
                <Slider
                  value={draft.primaryRamp.endpointChroma}
                  onChange={(endpointChroma) => updatePrimaryRamp({ endpointChroma })}
                  min={25}
                  max={100}
                  step={1}
                  aria-label="Ramp endpoint chroma"
                />
              </Stack>
              {draft.primary.map((color, index) => (
                <ColorInput
                  key={index}
                  label={`primary-${index} (${neutralScaleSteps[index]})`}
                  value={color}
                  format="hex"
                  withPicker={false}
                  withEyeDropper={false}
                  readOnly
                />
              ))}
              <Select
                label="Light active shade"
                value={String(draft.primaryShade.light)}
                data={neutralScaleSteps.map((_, index) => ({
                  value: String(index),
                  label: `primary-${index}`,
                }))}
                onChange={(value) =>
                  value &&
                  setDraft({
                    ...draft,
                    primaryShade: { ...draft.primaryShade, light: Number(value) as ColorShade },
                  })
                }
              />
              <Select
                label="Dark active shade"
                value={String(draft.primaryShade.dark)}
                data={neutralScaleSteps.map((_, index) => ({
                  value: String(index),
                  label: `primary-${index}`,
                }))}
                onChange={(value) =>
                  value &&
                  setDraft({
                    ...draft,
                    primaryShade: { ...draft.primaryShade, dark: Number(value) as ColorShade },
                  })
                }
              />
            </Stack>
            <MantineProvider
              theme={createAppTheme(draft)}
              cssVariablesResolver={semanticVariablesResolver}
              forceColorScheme={editorScheme}
            >
              <Stack gap="md">
                <Title order={2} size="h3">
                  Interaction preview
                </Title>
                <Text size="xs">
                  Filled, link, focus, and selected states: primary-
                  {draft.primaryShade[editorScheme]}
                </Text>
                <ContrastReadout
                  pairs={interactionContrastPairs(draft, editorScheme)}
                  title="APCA interaction contrast"
                />
                <Group>
                  <Button>Filled</Button>
                  <Button variant="light">Light</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="subtle">Subtle</Button>
                  <Button variant="transparent">Transparent</Button>
                </Group>
                <Stack gap={0}>
                  {interactionVariantLines.map((line) => (
                    <Text key={line} size="xs">
                      {line}
                    </Text>
                  ))}
                </Stack>
                <Group>
                  <ActionIcon aria-label="Filled action">+</ActionIcon>
                  <ActionIcon variant="light" aria-label="Light action">
                    +
                  </ActionIcon>
                  <ActionIcon variant="outline" aria-label="Outline action">
                    +
                  </ActionIcon>
                  <ActionIcon variant="subtle" aria-label="Subtle action">
                    +
                  </ActionIcon>
                </Group>
                <Text size="xs">
                  Action icons use the same filled, light, outline, and subtle values.
                </Text>
                <Group>
                  <Badge>Filled badge</Badge>
                  <Badge variant="light">Light badge</Badge>
                  <Badge variant="outline">Outline badge</Badge>
                  <ThemeIcon>+</ThemeIcon>
                  <ThemeIcon variant="light">+</ThemeIcon>
                </Group>
                <Text size="xs">
                  Badges and theme icons use their matching filled/light/outline values.
                </Text>
                <Anchor>Link — primary-{draft.primaryShade[editorScheme]}</Anchor>
                <TextInput label="Focused field" placeholder="Focus me" />
                <Group>
                  <Checkbox label="Checkbox" defaultChecked />
                  <Radio label="Radio" defaultChecked />
                  <Switch label="Switch" defaultChecked />
                </Group>
                <Text size="xs">
                  Checked checkbox, radio, switch, chip, progress, loader, and segmented selection:
                  primary-{draft.primaryShade[editorScheme]}.
                </Text>
                <Chip defaultChecked>Chip</Chip>
                <Progress value={62} />
                <Loader />
                <SegmentedControl data={['Selected', 'Other']} value="Selected" readOnly />
                <Text size="xs">
                  Focus ring / selection: primary-{draft.primaryShade[editorScheme]}
                </Text>
                <Alert title="Feedback">Action and focus colors use the primary palette.</Alert>
              </Stack>
            </MantineProvider>
          </SimpleGrid>
        </Tabs.Panel>
        <Tabs.Panel value="markers" pt="md">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
            <Surface p="md">
              <Stack align="center" gap="md">
                <Title order={2} size="h3" w="100%">
                  Marker hue wheel
                </Title>
                <MarkerWheel hues={draft.markerHues} ramp={draft.markerRamp} />
                <Text c="dimmed" size="sm">
                  Every family shares one gamut-aware OKLCH ramp. Their position around the wheel is
                  the only independent value.
                </Text>
                {markerCollisions.length > 0 && (
                  <Alert color="yellow" title="Nearby marker hues" w="100%">
                    {markerCollisions
                      .map(
                        ({ distance, names }) =>
                          `${names[0]} and ${names[1]} are ${Math.round(distance)}° apart`
                      )
                      .join('; ')}
                    . Keep marker families at least 25° apart for clear visual distinction.
                  </Alert>
                )}
                <MarkerRampSwatches hues={draft.markerHues} ramp={draft.markerRamp} />
              </Stack>
            </Surface>
            <Stack gap="md">
              <div>
                <Title order={2} size="h3">
                  Shared marker ramp
                </Title>
                <Text c="dimmed" size="sm">
                  Fraction uses the same share of each stop's sRGB gamut. Cap prevents hues with
                  more available chroma from becoming disproportionately neon. End boost moves the
                  outer stops toward their own available gamut without leaving sRGB.
                </Text>
              </div>
              <Stack gap={4}>
                <Text size="sm">Gamut fraction: {draft.markerRamp.fraction}%</Text>
                <Slider
                  aria-label="Marker gamut fraction"
                  max={100}
                  min={10}
                  onChange={(fraction) => updateMarkerRamp({ fraction })}
                  step={1}
                  value={draft.markerRamp.fraction}
                />
              </Stack>
              <Stack gap={4}>
                <Text size="sm">Chroma cap: {draft.markerRamp.cap.toFixed(3)}</Text>
                <Slider
                  aria-label="Marker chroma cap"
                  max={0.3}
                  min={0.025}
                  onChange={(cap) => updateMarkerRamp({ cap })}
                  step={0.005}
                  value={draft.markerRamp.cap}
                />
              </Stack>
              <Stack gap={4}>
                <Text size="sm">
                  End gamut boost: {Math.round(draft.markerRamp.endBoost * 100)}%
                </Text>
                <Slider
                  aria-label="Marker end gamut boost"
                  max={100}
                  min={0}
                  onChange={(endBoost) => updateMarkerRamp({ endBoost: endBoost / 100 })}
                  step={1}
                  value={Math.round(draft.markerRamp.endBoost * 100)}
                />
              </Stack>
              <Select
                label="Lightness curve"
                value={draft.markerRamp.curve}
                data={[
                  { value: 'even', label: 'Even' },
                  { value: 'soft', label: 'Soft ends' },
                  { value: 'dramatic', label: 'Dramatic ends' },
                ]}
                onChange={(curve) => {
                  if (curve === 'even' || curve === 'soft' || curve === 'dramatic') {
                    updateMarkerRamp({ curve });
                  }
                }}
              />
              <div>
                <Title order={2} size="h3">
                  Named marker families
                </Title>
                <Text c="dimmed" size="sm">
                  Use names such as orange, grape, and cyan in applets. Step 6 is each family's
                  standard marker strength.
                </Text>
              </div>
              {markerColorNames.map((name) => (
                <Stack key={name} gap={4}>
                  <Group justify="space-between">
                    <Group gap="xs">
                      <div
                        aria-hidden="true"
                        style={{
                          background: markerColor(draft.markerHues[name], draft.markerRamp),
                          borderRadius: '50%',
                          height: 16,
                          width: 16,
                        }}
                      />
                      <Text fw={600} size="sm">
                        {name}
                      </Text>
                    </Group>
                    <Group gap={2} wrap="nowrap">
                      <Text c="dimmed" size="xs">
                        {Math.round(draft.markerHues[name])}°
                      </Text>
                      <Stack gap={0}>
                        <ActionIcon
                          aria-label={`Increase ${name} hue`}
                          onClick={() =>
                            updateMarkerHue(name, nudgeMarkerHue(draft.markerHues[name], 1))
                          }
                          size="xs"
                          variant="subtle"
                        >
                          ▲
                        </ActionIcon>
                        <ActionIcon
                          aria-label={`Decrease ${name} hue`}
                          onClick={() =>
                            updateMarkerHue(name, nudgeMarkerHue(draft.markerHues[name], -1))
                          }
                          size="xs"
                          variant="subtle"
                        >
                          ▼
                        </ActionIcon>
                      </Stack>
                    </Group>
                  </Group>
                  <Slider
                    aria-label={`${name} hue`}
                    max={360}
                    min={0}
                    onChange={(hue) => updateMarkerHue(name, hue)}
                    step={1}
                    value={draft.markerHues[name]}
                  />
                </Stack>
              ))}
            </Stack>
          </SimpleGrid>
        </Tabs.Panel>
        <Tabs.Panel value="manage" pt="md">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
            <Surface p="md">
              <Stack gap="md">
                <div>
                  <Title order={2} size="h3">
                    Resume a theme
                  </Title>
                  <Text c="dimmed" size="sm">
                    Load a previously exported token file to continue editing it. Loading changes
                    the editor draft only; use the Shell action when you are ready to activate it.
                  </Text>
                </div>
                <FileInput
                  label="Load theme JSON"
                  placeholder="Choose an exported token file"
                  accept="application/json,.json"
                  clearable
                  onChange={importJson}
                />
                {importError && (
                  <Alert color="red" title="Could not load theme">
                    {importError}
                  </Alert>
                )}
                {dirty && (
                  <Alert color="blue" title="Draft ready">
                    The loaded or edited values are visible in the editor but are not yet the active
                    Shell theme.
                  </Alert>
                )}
              </Stack>
            </Surface>
            <Surface p="md">
              <Stack gap="md">
                <div>
                  <Title order={2} size="h3">
                    Shell theme
                  </Title>
                  <Text c="dimmed" size="sm">
                    Manage the values Shell uses on this device. The written baseline is the theme
                    currently in the project source.
                  </Text>
                </div>
                <Button disabled={!dirty} onClick={() => setApplyModalOpened(true)}>
                  {dirty ? 'Use editor theme in Shell' : 'Editor theme is already active'}
                </Button>
                <Button variant="default" onClick={() => setResetModalOpened(true)}>
                  Restore written Shell baseline
                </Button>
                <Button variant="default" onClick={exportJson}>
                  Download editor theme JSON
                </Button>
              </Stack>
            </Surface>
          </SimpleGrid>
        </Tabs.Panel>
      </Tabs>
      <Modal
        opened={applyModalOpened}
        onClose={() => setApplyModalOpened(false)}
        title="Use editor theme in Shell?"
        centered
      >
        <Stack gap="md">
          <Text>
            This replaces the active Shell theme on this device with the editor values, including
            the named marker palettes. You can restore the written Shell baseline at any time.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setApplyModalOpened(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                apply();
                setApplyModalOpened(false);
              }}
            >
              Use editor theme
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={resetModalOpened}
        onClose={() => setResetModalOpened(false)}
        title="Restore written Shell baseline?"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            This replaces the editor and active local Shell theme with the values currently written
            in the project, then removes this device’s saved theme settings.
          </Text>
          <Text size="sm" c="dimmed">
            Download the current editor theme first if you may want to restore it later.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setResetModalOpened(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmReset}>
              Restore written baseline
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
