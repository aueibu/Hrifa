import { useEffect, useState, type ReactNode } from 'react';
import { Tooltip } from '@mantine/core';
import { InfoBarActiveContext, useInfoBarActive } from '../../../components/InfoBar';

export { InfoBarActiveContext, useInfoBarActive };

/**
 * The text to show for whatever the pointer or keyboard focus is on: the nearest element at or above
 * it with a `data-info` attribute. Nothing needs wiring per component; any element can carry its own
 * explanation. The text is empty when the pointer is on nothing that has one.
 */
export function useHoverInfo(): string {
  const [info, setInfo] = useState('');
  useEffect(() => {
    const update = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      setInfo(target?.closest('[data-info]')?.getAttribute('data-info') ?? '');
    };
    const leave = (event: MouseEvent) => {
      // The pointer left the window.
      if (event.relatedTarget === null) {
        setInfo('');
      }
    };
    document.addEventListener('mouseover', update);
    document.addEventListener('focusin', update);
    document.addEventListener('mouseout', leave);
    return () => {
      document.removeEventListener('mouseover', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('mouseout', leave);
    };
  }, []);
  return info;
}

/**
 * Wraps `children` so hovering shows `help`: in the info bar when there is one, in a pop-up tooltip
 * when there is not. Pass a string for `help` to reach the bar; a node can only be a tooltip.
 */
export function InfoTooltip({
  help,
  children,
  className,
}: {
  help: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const bar = useInfoBarActive();
  return (
    <Tooltip
      label={help}
      multiline
      w={300}
      withArrow
      openDelay={200}
      position="right"
      disabled={bar && typeof help === 'string'}
    >
      <span className={className} data-info={typeof help === 'string' ? help : undefined}>
        {children}
      </span>
    </Tooltip>
  );
}
