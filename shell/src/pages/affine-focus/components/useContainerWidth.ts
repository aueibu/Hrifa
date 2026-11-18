import { useEffect, useState, type RefObject } from 'react';

export function useContainerWidth(ref: RefObject<HTMLElement | null>, fallbackWidth = 900): number {
  const [width, setWidth] = useState(fallbackWidth);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const measure = () => {
      const next = Math.round(el.clientWidth);
      if (next > 120) {
        setWidth(next);
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}
