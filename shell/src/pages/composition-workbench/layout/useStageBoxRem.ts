import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { pxToRem } from '../../../lib/stage';

/**
 * The size the Stage counts as before its box has been measured (a test environment with no layout, a first frame):
 * big enough that no docker is hidden by the narrow rule. The page passes it to `DockStage`, which would otherwise count
 * an unmeasured Stage as 0 by 0 and show nothing but strips.
 */
export const FALLBACK_STAGE_REM = { width: 80, height: 40 } as const;

/**
 * Measures the box a `DockStage` fills (rem), keeping the last real measurement and falling back to
 * `FALLBACK_STAGE_REM` while the box has no size. Attach `ref` to the element around the Stage.
 */
export function useStageBoxRem(): {
  ref: RefObject<HTMLDivElement | null>;
  widthRem: number;
  heightRem: number;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>(FALLBACK_STAGE_REM);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return undefined;
    }
    const read = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const px = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const width = pxToRem(rect.width, px);
        const height = pxToRem(rect.height, px);
        setSize((old) => (old.width === width && old.height === height ? old : { width, height }));
      }
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, widthRem: size.width, heightRem: size.height };
}
