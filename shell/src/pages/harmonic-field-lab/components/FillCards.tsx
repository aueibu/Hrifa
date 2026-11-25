/**
 * Fill cards (M7c): a button in the Retuner's card list that opens a centered modal with three sources (modes, keys that
 * fit, this generator's subsets), a live preview of the candidate cards (name, notes, tag), a checkbox per row and the
 * Apply footer. The rules are pure (`state/fillCards.ts`); Apply sends each card through the existing `ret/add`.
 */
import { useMemo, useState } from 'react';
import { Modal, Text } from '@mantine/core';
import { Checkbox, Button } from '../../../ui';
import {
  FILL_SOURCES,
  fillCandidates,
  planFill,
  planText,
  sourceBlocker,
  type FillInput,
  type FillSource,
} from '../state/fillCards';
import { ownerOfTab, subsetsOf } from '../state/generatorLibrary';
import type { RetState } from '../state/retuner';
import { Num, Tip, useLab } from './ui';
import classes from './panels.module.css';

const SOURCE_LABEL: Record<FillSource, string> = {
  modes: 'Modes of the current subset',
  keys: 'Keys that fit the field',
  subsets: "This generator's subsets",
};
const TAG_TEXT = { retuned: 'retuned notes', different: 'different notes' } as const;

export function FillCards({ r }: { r: RetState }) {
  const { state, tab, an, dispatch } = useLab();
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<ReadonlySet<FillSource>>(
    () => new Set<FillSource>(['modes', 'keys'])
  );
  // rows the user switched off (everything is checked by default, also new rows after a source change)
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());

  const owner = ownerOfTab(state.library, tab);
  const input: FillInput = useMemo(
    () => ({
      tab,
      keys: an.keys?.keys ?? null,
      subsets: subsetsOf(state.library, owner),
      cards: r.cards,
      dormant: r.dormant.length,
      relative: r.relative,
    }),
    [tab, an.keys, state.library, owner, r.cards, r.dormant.length, r.relative]
  );
  const blockers = useMemo(
    () =>
      Object.fromEntries(
        FILL_SOURCES.map((s) => [s, sourceBlocker(s, input, owner !== null)])
      ) as Record<FillSource, string | null>,
    [input, owner]
  );
  const active = useMemo(
    () => new Set([...sources].filter((s) => blockers[s] === null)),
    [sources, blockers]
  );
  const candidates = useMemo(
    () => (open ? fillCandidates(input, active) : []),
    [open, input, active]
  );
  const checked = useMemo(
    () => new Set(candidates.filter((c) => !off.has(c.key)).map((c) => c.key)),
    [candidates, off]
  );
  const plan = planFill(candidates, checked, r.cards.length, r.dormant.length);

  const toggleSource = (s: FillSource) =>
    setSources((p) => {
      const n = new Set(p);
      if (!n.delete(s)) {
        n.add(s);
      }
      return n;
    });
  const toggleRow = (k: string) =>
    setOff((p) => {
      const n = new Set(p);
      if (!n.delete(k)) {
        n.add(k);
      }
      return n;
    });
  const apply = () => {
    for (const c of plan.add) {
      dispatch({ type: 'ret/add', card: c.card });
    }
    setOff(new Set());
    setOpen(false);
  };

  return (
    <>
      <Tip k="fillCards" as="control">
        <Button
          size="xs"
          variant="default"
          disabled={tab.sel.length === 0}
          onClick={() => setOpen(true)}
        >
          Fill cards...
        </Button>
      </Tip>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title="Fill cards"
        size="min(34rem, 94vw)"
        centered
        closeButtonProps={{ 'aria-label': 'Close' }}
        transitionProps={{ duration: 0 }}
      >
        <div className={classes.stack}>
          <div className={classes.fillSources} role="group" aria-label="Sources">
            {FILL_SOURCES.map((s) => (
              <div key={s}>
                <Tip k="fillSources" as="control" block>
                  <Checkbox
                    size="sm"
                    label={SOURCE_LABEL[s]}
                    checked={sources.has(s) && blockers[s] === null}
                    disabled={blockers[s] !== null}
                    onChange={() => toggleSource(s)}
                  />
                </Tip>
                {blockers[s] && (
                  <Text size="xs" c="dimmed" ml={28}>
                    {blockers[s]}
                  </Text>
                )}
              </div>
            ))}
          </div>
          {candidates.length === 0 ? (
            <Text size="sm" c="dimmed">
              No new cards for these sources (every candidate is already a card, or no source is
              checked).
            </Text>
          ) : (
            <>
              <div className={classes.inlineField}>
                <Text size="xs" c="dimmed">
                  Preview ({candidates.length})
                </Text>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => setOff(new Set())}
                >
                  Select all
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => setOff(new Set(candidates.map((c) => c.key)))}
                >
                  Select none
                </Button>
              </div>
              <ul className={classes.fillList} aria-label="Candidate cards">
                {candidates.map((c) => (
                  <li key={c.key} className={classes.fillRow}>
                    <Checkbox
                      size="xs"
                      aria-label={`Add ${c.card.name}`}
                      checked={checked.has(c.key)}
                      onChange={() => toggleRow(c.key)}
                    />
                    <span className={classes.fillName}>{c.card.name}</span>
                    <Num muted>{c.card.notes.length} notes</Num>
                    <Tip k="fillTags">
                      <span className={classes.fillTag} data-tag={c.tag}>
                        {TAG_TEXT[c.tag]}
                      </span>
                    </Tip>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Text size="xs" role="status">
            {planText(plan)}
          </Text>
          <div className={classes.inlineField}>
            <Tip k="fillApply" as="control">
              <Button size="xs" disabled={plan.add.length === 0} onClick={apply}>
                Apply
              </Button>
            </Tip>
          </div>
        </div>
      </Modal>
    </>
  );
}
