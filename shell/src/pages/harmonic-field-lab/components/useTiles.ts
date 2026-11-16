import { useComputedColorScheme } from '@mantine/core';
import { useLabDeveloperOptions } from '../state/developerOptions';
import { type TileLook, type TileScheme } from '../state/tileColors';

/** The tile look settings and the scheme the colored tiles are drawn for. */
export function useTiles(): { look: TileLook; outline: boolean; scheme: TileScheme } {
  const [dev] = useLabDeveloperOptions();
  const scheme = useComputedColorScheme('light');
  return { look: dev.tileLook, outline: dev.tileOutline, scheme };
}
