/** One block of the encyclopaedia: heading, lede (the key fact), detail, "Open in reader". Collapses to heading + lede. */
import { useState, type ReactNode } from 'react';
import { ActionIcon, Modal, Text, Title, Tooltip } from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import { ChevronDownIcon, ExpandIcon } from './icons';
import type { TipKey } from './texts';
import { Tip } from './ui';
import classes from './mock.module.css';

interface ArticleProps {
  id: string;
  title: string;
  tip: TipKey;
  lede: ReactNode;
  span?: 1 | 2;
  /** Larger view for the reader modal; defaults to the article body. */
  reader?: ReactNode;
  children: ReactNode;
}

export function Article({ id, title, tip, lede, span = 1, reader, children }: ArticleProps) {
  const [open, setOpen] = useState(true);
  const [reading, setReading] = useState(false);
  const bodyId = `${id}-body`;
  return (
    <article id={id} className={classes.articleWrap} data-span={span} aria-labelledby={`${id}-h`}>
      <Surface className={classes.article}>
        <header className={classes.articleHead}>
          <Title order={3} size="h5" id={`${id}-h`} className={classes.articleTitle}>
            <Tip k={tip}>{title}</Tip>
          </Title>
          <div className={classes.articleActions}>
            <Tooltip label="Open a full-size reader" openDelay={300}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`Open ${title} in reader`}
                onClick={() => setReading(true)}
              >
                <ExpandIcon />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={open ? 'Collapse to heading and lede' : 'Expand'} openDelay={300}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => setOpen((o) => !o)}
                className={classes.chevron}
                data-open={open}
              >
                <ChevronDownIcon />
              </ActionIcon>
            </Tooltip>
          </div>
        </header>
        <Text className={classes.lede}>{lede}</Text>
        {open && (
          <div id={bodyId} className={classes.articleBody}>
            {children}
          </div>
        )}
        <Modal
          opened={reading}
          onClose={() => setReading(false)}
          title={title}
          size="min(70rem, 94vw)"
          centered
        >
          <Text className={classes.lede} mb="md">
            {lede}
          </Text>
          {reader ?? children}
        </Modal>
      </Surface>
    </article>
  );
}
