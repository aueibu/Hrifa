import { APCAcontrast, sRGBtoY } from 'apca-w3';

function hexToRgb(hex: string): [number, number, number] {
  const normalized =
    hex.length === 4
      ? hex
          .slice(1)
          .split('')
          .map((part) => part.repeat(2))
          .join('')
      : hex.slice(1);

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

/** Returns signed APCA lightness contrast (Lc): positive for dark-on-light. */
export function apcaContrast(text: string, background: string): number {
  const contrast = APCAcontrast(sRGBtoY(hexToRgb(text)), sRGBtoY(hexToRgb(background)));
  return typeof contrast === 'number' ? contrast : Number(contrast);
}

export function formatApcaContrast(value: number): string {
  return `Lc ${value.toFixed(0)}`;
}

export function apcaAssessment(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 75) return 'strong';
  if (magnitude >= 60) return 'body text';
  if (magnitude >= 45) return 'large text';
  if (magnitude >= 30) return 'spot text';
  return 'low contrast';
}
