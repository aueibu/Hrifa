import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { defaultThemeTokens } from '../../theme';
import { Surface } from './Surface';

const meta = {
  title: 'Theme/Review gallery',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Foundations: Story = {
  render: () => (
    <Stack maw={760} mx="auto" gap="lg">
      <Stack gap={2}>
        <Title order={1}>Theme review gallery</Title>
        <Text c="var(--text-muted)">
          Passive review surface. Use the shell Theme Editor to tune Mantine's stock neutral tokens.
        </Text>
      </Stack>
      <SimpleGrid cols={10} spacing={4}>
        {defaultThemeTokens.gray.map((color, index) => (
          <Box key={color} bg={color} bd="1px solid var(--border)" h={42}>
            <Text c={index < 5 ? 'dark.9' : 'gray.0'} fw={700} size="xs" ta="center" pt={10}>
              {index}
            </Text>
          </Box>
        ))}
      </SimpleGrid>
      <Group align="stretch" grow>
        <Surface>
          <Text fw={600}>Default panel</Text>
        </Surface>
        <Surface tone="raised">
          <Text fw={600}>Raised panel</Text>
        </Surface>
        <Surface tone="inset">
          <Text fw={600}>Inset panel</Text>
        </Surface>
      </Group>
      <Surface>
        <Stack gap="md">
          <TextInput label="Standard field" placeholder="Inspect normal component defaults" />
          <Group>
            <Button>Primary action</Button>
            <Button variant="default">Secondary action</Button>
            <Badge variant="light">Status</Badge>
          </Group>
          <Alert title="Feedback state">
            This is the passive regression review of the live component recipes.
          </Alert>
        </Stack>
      </Surface>
    </Stack>
  ),
};
