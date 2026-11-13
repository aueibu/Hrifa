/**
 * Stroke icons on the same 24-unit grid and 2-unit stroke as the shell's ColorSchemeToggle icons (the shell has no icon
 * library). One size per context: 16.
 */
import type { SVGProps } from 'react';

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ChevronDownIcon = () => (
  <Icon>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

export const ExpandIcon = () => (
  <Icon>
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </Icon>
);

export const BookIcon = () => (
  <Icon>
    <path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h8" />
  </Icon>
);

export const SearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Icon>
);

export const KeyboardIcon = () => (
  <Icon>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const ArrowUpIcon = () => (
  <Icon>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Icon>
);

export const ArrowDownIcon = () => (
  <Icon>
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);

export const HomeIcon = () => (
  <Icon>
    <path d="M3 11l9-8 9 8M5 10v10h14V10" />
  </Icon>
);

export const PlayIcon = () => (
  <Icon>
    <path d="M7 4l13 8-13 8z" />
  </Icon>
);

export const StopIcon = () => (
  <Icon>
    <rect x="5" y="5" width="14" height="14" rx="1" />
  </Icon>
);

export const GearIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
  </Icon>
);

export const SaveIcon = () => (
  <Icon>
    <path d="M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7" />
  </Icon>
);

export const DownloadIcon = () => (
  <Icon>
    <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />
  </Icon>
);

export const MinusIcon = () => (
  <Icon>
    <path d="M5 12h14" />
  </Icon>
);

export const SoundIcon = () => (
  <Icon>
    <path d="M4 9v6h4l5 4V5L8 9zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
  </Icon>
);

export const TableIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M3 15h18M9 4v16" />
  </Icon>
);

export const PinIcon = () => (
  <Icon>
    <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3zM12 14v7" />
  </Icon>
);

export const ArrowLeftIcon = () => (
  <Icon>
    <path d="M19 12H5M12 5l-7 7 7 7" />
  </Icon>
);

export const ArrowRightIcon = () => (
  <Icon>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
