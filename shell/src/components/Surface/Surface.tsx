import type { PropsWithChildren } from 'react';
import { Paper, type PaperProps, useProps } from '@mantine/core';
import classes from './Surface.module.css';

type SurfaceTone = 'default' | 'raised' | 'inset';

interface SurfaceProps extends PropsWithChildren<PaperProps> {
  tone?: SurfaceTone;
}

const defaultProps: Partial<SurfaceProps> = {
  p: 'md',
  radius: 'var(--radius-panel)',
  withBorder: true,
};

/** Shared panel structure. New ports choose a tone instead of styling Paper or Card directly. */
export function Surface(props: SurfaceProps) {
  const { className, tone, ...others } = useProps('Surface', defaultProps, props);

  return <Paper className={`${classes.root} ${className ?? ''}`} data-tone={tone} {...others} />;
}
