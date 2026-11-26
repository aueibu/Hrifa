import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Accordion,
  Alert,
  Anchor,
  AppShell,
  Badge,
  Box,
  Card,
  Code,
  Divider,
  Group,
  Kbd,
  Menu,
  Modal,
  Pagination,
  Progress,
  SimpleGrid,
  Slider,
  Stack,
  Tabs,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { ColorSchemeToggle } from '../components/ColorSchemeToggle/ColorSchemeToggle';
import { Surface } from '../components/Surface/Surface';
import {
  ActionIcon,
  Button,
  Checkbox,
  Chip,
  MultiSelect,
  NativeSelect,
  Radio,
  ScrubNumber,
  SegmentedControl,
  Select,
  Switch,
  Table,
  TextInput,
  Textarea,
} from '../ui';

const SURFACE_TIERS = [
  { name: '--panel-well', role: 'Deepest recess (wells, plots)' },
  { name: '--surface', role: 'Page floor, gaps, splitters' },
  { name: '--panel', role: 'Sidebars, inspector, outliner' },
  { name: '--panel-slot', role: 'Empty cells, inset groups' },
  { name: '--panel-body', role: 'Canvas, lanes, device body' },
  { name: '--panel-header', role: 'Panel & device headers' },
  { name: '--chrome', role: 'Raised clickable controls' },
  { name: '--row-alt', role: 'Alternating table row tint' },
];

const OUTLINER_ROWS = [
  { name: 'Scene Collection', type: 'Collection', items: 12, status: 'Active' },
  { name: 'Harmonic Grid', type: 'Generator', items: 7, status: 'Enabled' },
  { name: 'Euclidean Pulse', type: 'Rhythm', items: 16, status: 'Enabled' },
  { name: 'Voice Leading', type: 'Operator', items: 4, status: 'Muted' },
  { name: 'Retuner Output', type: 'Sink', items: 2, status: 'Active' },
];

const MARKER_HUES = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'pink'] as const;

const FONT_SIZES = [
  { size: 'xs', px: 11 },
  { size: 'sm', px: 12 },
  { size: 'md', px: 13 },
  { size: 'lg', px: 15 },
  { size: 'xl', px: 18 },
] as const;

export function UiShowcasePage() {
  const [scrubUnbounded, setScrubUnbounded] = useState(440);
  const [scrubRange, setScrubRange] = useState(0.65);
  const [scrubBipolar, setScrubBipolar] = useState(-12);
  const [sliderVal, setSliderVal] = useState(40);
  const [segmentVal, setSegmentVal] = useState('edit');
  const [selectVal, setSelectVal] = useState<string | null>('ji');
  const [nativeVal, setNativeVal] = useState('12-edo');
  const [multiVal, setMultiVal] = useState<string[]>(['3-limit', '5-limit']);
  const [switchOn, setSwitchOn] = useState(true);
  const [checkOn, setCheckOn] = useState(true);
  const [radioVal, setRadioVal] = useState('ratios');
  const [chipVal, setChipVal] = useState('all');
  const [page, setPage] = useState(2);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <AppShell header={{ height: 48 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="md">
            <Anchor component={Link} to="/" size="sm">
              Workbench
            </Anchor>
            <Text size="sm" c="dimmed">
              /
            </Text>
            <Text size="sm" fw={600}>
              UI &amp; Mantine Stock Showcase
            </Text>
          </Group>
          <Group gap="md">
            <Anchor component={Link} to="/theme" size="sm">
              Theme editor
            </Anchor>
            <ColorSchemeToggle />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Stack gap="lg" maw={1120} mx="auto">
          <Box>
            <Title order={2}>Theme &amp; Stock Control Reference</Title>
            <Text size="sm" c="dimmed">
              All UI controls from src/ui/ and stock Mantine display components rendered with the
              active theme. Toggle Light/Dark in the header to compare both schemes.
            </Text>
          </Box>

          {/* 1. Surface Tiers */}
          <Surface p="md">
            <Stack gap="sm">
              <Title order={4}>Surface Tiers</Title>
              <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
                {SURFACE_TIERS.map((tier) => (
                  <Box
                    key={tier.name}
                    p="xs"
                    style={{
                      background: `var(${tier.name})`,
                      border: '1px solid var(--grid)',
                      borderRadius: 'var(--radius-panel)',
                    }}
                  >
                    <Text size="xs" fw={600} ff="monospace">
                      {tier.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {tier.role}
                    </Text>
                  </Box>
                ))}
              </SimpleGrid>
            </Stack>
          </Surface>

          {/* 2. Buttons & SegmentedControl */}
          <Surface p="md">
            <Stack gap="sm">
              <Title order={4}>Buttons, ActionIcons &amp; SegmentedControl</Title>
              <Group gap="xs" wrap="wrap">
                <Button variant="default">Default (--chrome)</Button>
                <Button>Filled (Primary)</Button>
                <Button variant="light">Light</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="subtle">Subtle</Button>
                <Button variant="transparent">Transparent</Button>
                <Button variant="default" disabled>
                  Disabled
                </Button>
                <Button variant="default" size="compact-sm">
                  Compact
                </Button>
              </Group>
              <Group gap="sm" align="center">
                <Text size="xs" c="dimmed">
                  ActionIcon:
                </Text>
                <Tooltip label="Default ActionIcon">
                  <ActionIcon variant="default" aria-label="Default action">
                    +
                  </ActionIcon>
                </Tooltip>
                <ActionIcon aria-label="Filled action">★</ActionIcon>
                <ActionIcon variant="light" aria-label="Light action">
                  ◆
                </ActionIcon>
                <ActionIcon variant="subtle" aria-label="Subtle action">
                  ⋯
                </ActionIcon>
                <ActionIcon variant="default" disabled aria-label="Disabled action">
                  ×
                </ActionIcon>
                <Divider orientation="vertical" />
                <Text size="xs" c="dimmed">
                  SegmentedControl:
                </Text>
                <SegmentedControl
                  value={segmentVal}
                  onChange={setSegmentVal}
                  data={[
                    { label: 'Edit', value: 'edit' },
                    { label: 'Inspect', value: 'inspect' },
                    { label: 'Play', value: 'play' },
                  ]}
                />
              </Group>
            </Stack>
          </Surface>

          {/* 3. Inputs & Numeric Controls */}
          <Surface p="md">
            <Stack gap="sm">
              <Title order={4}>Inputs &amp; Numeric Controls (src/ui/)</Title>
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                <Stack gap="xs">
                  <Text size="xs" fw={600} c="dimmed">
                    ScrubNumber (Blender wcol_num)
                  </Text>
                  <Group justify="space-between">
                    <Text size="xs">Unbounded (Hz)</Text>
                    <ScrubNumber
                      aria-label="Unbounded frequency"
                      value={scrubUnbounded}
                      defaultValue={440}
                      step={1}
                      suffix=" Hz"
                      onChange={setScrubUnbounded}
                      style={{ width: 110 }}
                    />
                  </Group>
                  <Group justify="space-between">
                    <Text size="xs">Range [0, 1]</Text>
                    <ScrubNumber
                      aria-label="Bounded range"
                      value={scrubRange}
                      defaultValue={0.5}
                      range={[0, 1]}
                      step={0.01}
                      onChange={setScrubRange}
                      style={{ width: 110 }}
                    />
                  </Group>
                  <Group justify="space-between">
                    <Text size="xs">Bipolar [-24, 24]</Text>
                    <ScrubNumber
                      aria-label="Bipolar range"
                      value={scrubBipolar}
                      defaultValue={0}
                      range={[-24, 24]}
                      step={1}
                      onChange={setScrubBipolar}
                      style={{ width: 110 }}
                    />
                  </Group>
                  <Group justify="space-between">
                    <Text size="xs">Disabled</Text>
                    <ScrubNumber
                      aria-label="Disabled scrub"
                      value={100}
                      onChange={() => {}}
                      disabled
                      style={{ width: 110 }}
                    />
                  </Group>
                </Stack>

                <Stack gap="xs">
                  <TextInput label="TextInput" placeholder="Enter name..." defaultValue="Scale A" />
                  <TextInput
                    label="TextInput (error)"
                    error="Name already exists"
                    defaultValue=""
                  />
                  <TextInput label="TextInput (disabled)" disabled defaultValue="Read-only" />
                  <Textarea label="Textarea" placeholder="Notes..." minRows={2} />
                </Stack>

                <Stack gap="xs">
                  <Select
                    label="Select"
                    value={selectVal}
                    onChange={setSelectVal}
                    data={[
                      { value: 'ji', label: 'Just Intonation' },
                      { value: 'edo', label: 'Equal Temperament' },
                      { value: 'meantone', label: 'Meantone' },
                    ]}
                  />
                  <NativeSelect
                    label="NativeSelect"
                    value={nativeVal}
                    onChange={(e) => setNativeVal(e.currentTarget.value)}
                    data={['12-edo', '19-edo', '31-edo', '53-edo']}
                  />
                  <MultiSelect
                    label="MultiSelect"
                    value={multiVal}
                    onChange={setMultiVal}
                    data={['3-limit', '5-limit', '7-limit', '11-limit']}
                  />
                </Stack>
              </SimpleGrid>

              <Divider my="xs" />

              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                <Stack gap="xs">
                  <Text size="xs" fw={600} c="dimmed">
                    Slider
                  </Text>
                  <Slider value={sliderVal} onChange={setSliderVal} />
                </Stack>

                <Stack gap="xs">
                  <Switch
                    label="Switch toggle"
                    checked={switchOn}
                    onChange={(e) => setSwitchOn(e.currentTarget.checked)}
                  />
                  <Checkbox
                    label="Checkbox option"
                    checked={checkOn}
                    onChange={(e) => setCheckOn(e.currentTarget.checked)}
                  />
                </Stack>

                <Stack gap="xs">
                  <Radio.Group value={radioVal} onChange={setRadioVal} label="Radio.Group">
                    <Group gap="md" mt={4}>
                      <Radio value="ratios" label="Ratios" />
                      <Radio value="cents" label="Cents" />
                    </Group>
                  </Radio.Group>
                  <Chip.Group value={chipVal} onChange={(v) => setChipVal(v as string)}>
                    <Group gap="xs">
                      <Chip value="all">All</Chip>
                      <Chip value="active">Active</Chip>
                      <Chip value="muted">Muted</Chip>
                    </Group>
                  </Chip.Group>
                </Stack>
              </SimpleGrid>
            </Stack>
          </Surface>

          {/* 4. Tables */}
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Surface p="md">
              <Stack gap="xs">
                <Title order={4}>Table (Default — Blender Outliner)</Title>
                <Text size="xs" c="dimmed">
                  Striped even rows (--row-alt), hover highlight, no row borders, tabular numerals.
                </Text>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th style={{ textAlign: 'right' }}>Items</Table.Th>
                      <Table.Th>Status</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {OUTLINER_ROWS.map((row) => (
                      <Table.Tr key={row.name}>
                        <Table.Td>{row.name}</Table.Td>
                        <Table.Td>{row.type}</Table.Td>
                        <Table.Td style={{ textAlign: 'right' }}>{row.items}</Table.Td>
                        <Table.Td>{row.status}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Stack>
            </Surface>

            <Surface p="md">
              <Stack gap="xs">
                <Title order={4}>Table (withRowBorders + withColumnBorders)</Title>
                <Text size="xs" c="dimmed">
                  Optional grid borders using --grid, keeping alternating row tint.
                </Text>
                <Table withRowBorders withColumnBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Ratio</Table.Th>
                      <Table.Th style={{ textAlign: 'right' }}>Cents</Table.Th>
                      <Table.Th style={{ textAlign: 'right' }}>Error</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    <Table.Tr>
                      <Table.Td ff="monospace">3/2</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>701.96</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>-1.96</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td ff="monospace">5/4</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>386.31</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>+13.69</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td ff="monospace">7/4</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>968.83</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>+31.17</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td ff="monospace">11/8</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>551.32</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>-48.68</Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
              </Stack>
            </Surface>
          </SimpleGrid>

          {/* 5. Badges, Alerts, Progress, Typography */}
          <Surface p="md">
            <Stack gap="sm">
              <Title order={4}>Badges, Alerts, Progress &amp; Inline Elements</Title>
              <Group gap="xs" wrap="wrap">
                <Badge>Primary filled</Badge>
                <Badge variant="light">Primary light</Badge>
                <Badge variant="outline">Primary outline</Badge>
                {MARKER_HUES.map((hue) => (
                  <Badge key={hue} color={hue} variant="light">
                    {hue}
                  </Badge>
                ))}
              </Group>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <Alert title="Info / Primary">Standard informational alert.</Alert>
                <Alert color="green" title="Success">
                  Saved cleanly to workspace.
                </Alert>
                <Alert color="orange" title="Warning">
                  Values clamped to safe range.
                </Alert>
                <Alert color="red" title="Error">
                  Could not parse expression.
                </Alert>
              </SimpleGrid>
              <Progress value={62} size="sm" />
              <Group gap="md">
                <Text size="sm">
                  Shortcut: <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd>
                </Text>
                <Text size="sm">
                  Inline code: <Code>3/2 * 5/4</Code>
                </Text>
              </Group>
            </Stack>
          </Surface>

          {/* 6. Tabs, Accordion, Menu, Pagination, Modal */}
          <Surface p="md">
            <Stack gap="sm">
              <Title order={4}>Tabs, Accordion, Menu, Pagination &amp; Modal</Title>
              <Tabs defaultValue="first">
                <Tabs.List>
                  <Tabs.Tab value="first">Overview</Tabs.Tab>
                  <Tabs.Tab value="second">Properties</Tabs.Tab>
                  <Tabs.Tab value="third">History</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="first" pt="xs">
                  <Text size="sm">First tab panel content.</Text>
                </Tabs.Panel>
                <Tabs.Panel value="second" pt="xs">
                  <Text size="sm">Second tab panel content.</Text>
                </Tabs.Panel>
                <Tabs.Panel value="third" pt="xs">
                  <Text size="sm">Third tab panel content.</Text>
                </Tabs.Panel>
              </Tabs>

              <Accordion variant="default">
                <Accordion.Item value="a">
                  <Accordion.Control>Accordion section A</Accordion.Control>
                  <Accordion.Panel>
                    <Text size="sm">Collapsible details inside a stock Mantine Accordion.</Text>
                  </Accordion.Panel>
                </Accordion.Item>
                <Accordion.Item value="b">
                  <Accordion.Control>Accordion section B</Accordion.Control>
                  <Accordion.Panel>
                    <Card withBorder p="xs">
                      <Text size="xs">Nested Card inside Accordion.</Text>
                    </Card>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>

              <Group justify="space-between" wrap="wrap">
                <Group gap="sm">
                  <Menu>
                    <Menu.Target>
                      <Button variant="default">Open Menu</Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Label>Actions</Menu.Label>
                      <Menu.Item>Duplicate</Menu.Item>
                      <Menu.Item>Rename...</Menu.Item>
                      <Menu.Divider />
                      <Menu.Item color="red">Delete</Menu.Item>
                    </Menu.Dropdown>
                  </Menu>

                  <Button variant="default" onClick={() => setModalOpen(true)}>
                    Open Modal
                  </Button>
                </Group>

                <Pagination total={6} value={page} onChange={setPage} size="sm" />
              </Group>
            </Stack>
          </Surface>

          {/* 7. Typography */}
          <Surface p="md">
            <Stack gap="xs">
              <Title order={4}>Typography Sizes</Title>
              {FONT_SIZES.map(({ size, px }) => (
                <Group key={size} gap="md" wrap="nowrap" align="baseline">
                  <Text size="xs" c="dimmed" ff="monospace" w={72} style={{ flexShrink: 0 }}>
                    {size} ({px}px)
                  </Text>
                  <Text size={size}>The quick brown fox jumps over 440 Hz and 3/2:5/4 ratios.</Text>
                </Group>
              ))}
            </Stack>
          </Surface>
        </Stack>

        <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="Stock Modal Preview">
          <Stack gap="sm">
            <Text size="sm">This is how a stock Mantine Modal appears in the current theme.</Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setModalOpen(false)}>
                Close
              </Button>
            </Group>
          </Stack>
        </Modal>
      </AppShell.Main>
    </AppShell>
  );
}
