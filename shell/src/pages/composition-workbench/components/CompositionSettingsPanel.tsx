import { Drawer, NumberInput, Stack, Text, Title } from '@mantine/core';
import { useCompositionSettings } from '../compositionSettings';

// New settings get their own <Title>-headed section below, in whatever grouping makes sense —
// this file only needs a new control added to it; compositionSettings.tsx is where the actual
// field/default/validation lives.
export function CompositionSettingsPanel({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose(): void;
}) {
  const { settings, updateSettings } = useCompositionSettings();

  return (
    <Drawer opened={opened} onClose={onClose} title="Workbench settings" position="right">
      <Stack gap="lg">
        <div>
          <Title order={4} size="h6" mb={4}>
            Pitch
          </Title>
          <Stack gap="xs">
            <NumberInput
              label="EDO (steps per octave)"
              description="Applies to pitch-class material — Scale Construction, Scale Evolution, Pitch List's pitch-class format, Arithmetic, and pitch-class route treatments. Concrete MIDI/note-name pitch stays 12-tone."
              min={1}
              max={96}
              step={1}
              value={settings.edo}
              onChange={(value) =>
                typeof value === 'number' && updateSettings({ edo: Math.max(1, Math.round(value)) })
              }
            />
            {settings.edo !== 12 && (
              <Text size="xs" c="dimmed">
                At {settings.edo}-EDO, pitch classes display as plain step numbers (0–{settings.edo - 1})
                rather than letter names — there's no standard note-name convention outside 12-EDO.
              </Text>
            )}
          </Stack>
        </div>
      </Stack>
    </Drawer>
  );
}
