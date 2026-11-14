import { useEffect, useState } from 'react';

/** The window width in rem (document root font size), kept current on resize. */
export function useWidthRem(): number {
  const read = () => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return window.innerWidth / rem;
  };
  const [width, setWidth] = useState(read);
  useEffect(() => {
    const on = () => setWidth(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return width;
}
