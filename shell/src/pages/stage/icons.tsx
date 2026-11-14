/** Small stroked icons for the slot header tools (16 px, current colour). */
import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const LeftIcon = () => (
  <Icon>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);
export const RightIcon = () => (
  <Icon>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);
export const UpIcon = () => (
  <Icon>
    <path d="M5 15l7-7 7 7" />
  </Icon>
);
export const DownIcon = () => (
  <Icon>
    <path d="M5 9l7 7 7-7" />
  </Icon>
);
export const StackIcon = () => (
  <Icon>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);
export const UnstackIcon = () => (
  <Icon>
    <path d="M4 5h16v6H4zM4 15h16v4H4z" />
  </Icon>
);
export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
