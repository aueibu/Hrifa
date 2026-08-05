import type { ReactNode } from 'react';
import { Text, type TextProps } from '@mantine/core';

export function Mono({ children, ...props }: TextProps & { children?: ReactNode }) {
  return (
    <Text ff="monospace" {...props}>
      {children}
    </Text>
  );
}
