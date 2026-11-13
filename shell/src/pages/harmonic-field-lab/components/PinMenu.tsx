/** A small menu that asks which side to pin a panel on: Pin left or Pin right (the inner end, next to the generator). */
import type { ReactNode } from 'react';
import { Menu } from '@mantine/core';

export function PinMenu({
  children,
  onPin,
}: {
  /** The trigger: one element that takes a ref (a button). */
  children: ReactNode;
  onPin: (side: 'left' | 'right') => void;
}) {
  return (
    <Menu position="bottom-end" withinPortal shadow="none">
      <Menu.Target>{children}</Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => onPin('left')}>Pin left</Menu.Item>
        <Menu.Item onClick={() => onPin('right')}>Pin right</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
