/** Sticky contents rail: every section and block with a one-line summary; click to jump; simple scroll-spy. */
import { useEffect, useState } from 'react';
import { Text } from '@mantine/core';
import { BLOCK_IDS, SECTIONS } from './sections';
import classes from './mock.module.css';

export function Rail() {
  const [active, setActive] = useState<string>(BLOCK_IDS[0]);

  useEffect(() => {
    // The current block is the last one whose top is at or above the line just under the sticky header.
    const line = 140;
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = BLOCK_IDS[0];
      for (const id of BLOCK_IDS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) {
          current = id;
        }
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, []);

  const jump = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className={classes.rail} aria-label="Contents">
      {SECTIONS.map((s) => (
        <div key={s.id} className={classes.railGroup}>
          <button type="button" className={classes.railSection} onClick={() => jump(s.id)}>
            {s.title}
          </button>
          {s.blocks.map((b) => (
            <button
              key={b.id}
              type="button"
              className={classes.railItem}
              data-active={active === b.id}
              aria-current={active === b.id ? 'location' : undefined}
              title={`${b.title}: ${b.summary}`}
              onClick={() => jump(b.id)}
            >
              <span className={classes.railTitle}>{b.title}</span>
              <Text span ff="monospace" className={classes.railSummary}>
                {b.summary}
              </Text>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
