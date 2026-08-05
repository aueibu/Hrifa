import { Link } from 'react-router-dom';
import { Anchor, Stack, Text, Title } from '@mantine/core';

export function NotFoundPage() {
  return (
    <Stack maw={480} mx="auto" p="md" gap="sm" pt={80}>
      <Title order={1} size="h2">
        Page not found
      </Title>
      <Text c="dimmed">
        This path isn't part of the shell yet — it may belong to an applet that hasn't been ported
        here.
      </Text>
      <Anchor component={Link} to="/">
        &larr; Back to workbench
      </Anchor>
    </Stack>
  );
}
