import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AppShell,
  Anchor,
  Badge,
  Card,
  Chip,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { ColorSchemeToggle } from '../components/ColorSchemeToggle/ColorSchemeToggle';
import { Mono } from '../components/Mono/Mono';
import { applets, type Applet } from '../data/applets';

const statusColor: Record<Applet['status'], string> = {
  maintained: 'green',
  experimental: 'yellow',
};

const categories = ['all', ...new Set(applets.map((applet) => applet.category))];

export function HomePage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return applets.filter((applet) => {
      const matchesCategory = category === 'all' || applet.category === category;
      const matchesTerm =
        `${applet.title} ${applet.category} ${applet.status} ${applet.runtime} ${applet.description}`
          .toLowerCase()
          .includes(term);
      return matchesCategory && matchesTerm;
    });
  }, [search, category]);

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Mono size="xs" c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
            Hrifa / Workbench
          </Mono>
          <Group gap="md">
            <Anchor component={Link} to="/theme" size="sm">
              Theme editor
            </Anchor>
            <ColorSchemeToggle />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Stack gap="lg">
          <Stack gap="xs" mb="md">
            <Title order={1} fz={{ base: 32, sm: 48 }}>
              Tools for looking at things differently.
            </Title>
            <Mono c="dimmed">
              A growing collection of small visual instruments: places to draw, fold, transform,
              name, and explore.
            </Mono>
          </Stack>

          <TextInput
            label="Search"
            placeholder="Search the workbench"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />

          <Chip.Group value={category} onChange={(value) => setCategory(value as string)}>
            <Group gap="xs">
              {categories.map((option) => (
                <Chip key={option} value={option}>
                  {option}
                </Chip>
              ))}
            </Group>
          </Chip.Group>

          <Text size="sm" c="dimmed">
            {visible.length} {visible.length === 1 ? 'applet' : 'applets'}
          </Text>

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            {visible.map((applet) => {
              const cardBody = (
                <>
                  <Group justify="space-between" mb="xs">
                    <Badge variant="light">{applet.category}</Badge>
                    <Badge color={statusColor[applet.status]}>{applet.status}</Badge>
                  </Group>

                  <Text fw={600}>{applet.title}</Text>
                  <Mono size="sm" c="dimmed" mt="xs">
                    {applet.description}
                  </Mono>
                  <Mono size="xs" c="dimmed" mt="md">
                    {applet.runtime}
                  </Mono>
                </>
              );

              return applet.href.startsWith('/') ? (
                <Card
                  key={applet.href}
                  component={Link}
                  to={applet.href}
                  withBorder
                  padding="lg"
                  radius="md"
                >
                  {cardBody}
                </Card>
              ) : (
                <Card
                  key={applet.href}
                  component="a"
                  href={applet.href}
                  target="_blank"
                  rel="noopener"
                  withBorder
                  padding="lg"
                  radius="md"
                >
                  {cardBody}
                </Card>
              );
            })}
          </SimpleGrid>

          {visible.length === 0 && (
            <Text c="dimmed" ta="center">
              No applets match that search.
            </Text>
          )}
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
