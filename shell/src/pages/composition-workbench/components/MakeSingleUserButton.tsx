import { ActionIcon } from '@mantine/core';

interface MakeSingleUserButtonProps {
  /** How many users the data-block has; below 2 it is already single user and the button is disabled. */
  users: number;
  /** "this object" in Properties, "this place" on the Desk: used in the tooltip. */
  who: string;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * Make single user as a small copy icon (Blender: the user count is the button; here a compact icon
 * keeps the rows narrow). The accessible name stays "Make single user" for screen readers and tests.
 */
export function MakeSingleUserButton({ users, who, disabled, onClick }: MakeSingleUserButtonProps) {
  const single = users < 2;
  return (
    <ActionIcon
      size="sm"
      variant="default"
      aria-label="Make single user"
      disabled={disabled || single}
      data-info={
        single
          ? 'Only one place uses this data-block, so it is already single user.'
          : `Make single user: give ${who} its own copy, named as a variation. The other places keep the original.`
      }
      onClick={onClick}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
        <path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6.5a1 1 0 0 0-1 1v6.5a1 1 0 0 0 1 1h.5" />
      </svg>
    </ActionIcon>
  );
}
