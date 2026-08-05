import type { ReactNode } from 'react';
import { Text, type TextProps } from '@mantine/core';
import './Reading.css';

export function Reading({ children, ...props }: TextProps & { children?: ReactNode }) {
  return (
    <Text ff="'Crimson Text', Georgia, serif" {...props}>
      {children}
    </Text>
  );
}
