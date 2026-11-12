import { Link } from 'react-router-dom';
import { Anchor, AppShell, Group, Stack, Text, Title } from '@mantine/core';
import { ColorSchemeToggle } from '../components/ColorSchemeToggle/ColorSchemeToggle';
import { Surface } from '../components/Surface/Surface';

export function HarmonicFieldLabPage() {
  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Anchor component={Link} to="/" size="sm">
              &larr; Home
            </Anchor>
            <Text c="dimmed">/</Text>
            <Title order={1} size="h4">
              Harmonic Field Lab
            </Title>
          </Group>
          <ColorSchemeToggle />
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Surface maw={640} mx="auto">
          <Stack gap="xs">
            <Title order={2} size="h4">
              Coming soon
            </Title>
            <Text>
              A workbench for building microtonal note fields from exact ratios and equal divisions,
              carving scales out of them, and seeing how every chord and interval sits against just
              intonation.
            </Text>
          </Stack>
        </Surface>
      </AppShell.Main>
    </AppShell>
  );
}
