import type { ReactNode } from 'react';
import type { TextProps } from '@mantine/core';
import { Mono } from '../Mono/Mono';

/** A monospace value: a computed result, coordinate, identifier, or count — not just styled prose. */
export function Data(props: TextProps & { children?: ReactNode }) {
  return <Mono {...props} />;
}
