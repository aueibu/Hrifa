/** Glossary drawer: every tooltip text from texts.ts, searchable, with "see also" links. */
import { useMemo, useRef, useState } from 'react';
import { Anchor, Drawer, Text, TextInput } from '@mantine/core';
import { SearchIcon } from './icons';
import { GLOSSARY, TIPS, type TipKey } from './texts';
import { Num } from './ui';
import classes from './mock.module.css';

export function GlossaryDrawer({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const refs = useRef(new Map<TipKey, HTMLElement>());
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t
      ? GLOSSARY.filter(({ entry }) => `${entry.term} ${entry.text}`.toLowerCase().includes(t))
      : GLOSSARY;
  }, [q]);
  const goTo = (key: TipKey) => {
    if (!shown.some((g) => g.key === key)) {
      setQ('');
    }
    // after the list re-renders
    setTimeout(() => refs.current.get(key)?.scrollIntoView({ block: 'start' }), 0);
  };
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="26rem"
      title="Glossary"
      aria-label="Glossary"
    >
      <TextInput
        placeholder="Search terms and explanations"
        aria-label="Search the glossary"
        leftSection={<SearchIcon />}
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
        mb="xs"
      />
      <Text size="xs" c="dimmed" mb="sm">
        <Num>{shown.length}</Num> of <Num>{GLOSSARY.length}</Num> entries. Hovering any label in the
        lab shows the same text.
      </Text>
      <dl className={classes.glossary}>
        {shown.map(({ key, entry }) => (
          <div
            key={key}
            className={classes.glossEntry}
            ref={(el) => {
              if (el) {
                refs.current.set(key, el);
              }
            }}
          >
            <dt>{entry.term}</dt>
            <dd>
              {entry.text}
              {entry.see && (
                <span className={classes.see}>
                  See also:{' '}
                  {entry.see.map((s, i) => (
                    <span key={s}>
                      {i > 0 && ', '}
                      <Anchor
                        component="button"
                        type="button"
                        size="xs"
                        onClick={() => goTo(s as TipKey)}
                      >
                        {TIPS[s as TipKey].term}
                      </Anchor>
                    </span>
                  ))}
                </span>
              )}
            </dd>
          </div>
        ))}
        {shown.length === 0 && <Text c="dimmed">No entry matches &ldquo;{q}&rdquo;.</Text>}
      </dl>
    </Drawer>
  );
}
