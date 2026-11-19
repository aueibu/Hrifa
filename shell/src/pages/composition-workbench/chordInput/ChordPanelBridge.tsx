import { useEffect, useRef } from 'react';
import type { StageApi } from '../../../components/Stage/dock';
import { dockerHolding, type Screenset } from '../../../lib/stage';
import { CHORDS_PANEL } from '../layout/workbenchScreensets';
import { useChordSelector, useChordSession } from './ChordSessionProvider';

/**
 * Joins the page chord session to the dock Stage (M6a, design 1.3 and 3.5, decision 1b). Renders nothing; mounted by the
 * page inside `WorkbenchSessions`, beside the Stage, because it needs both. It is the only code that opens the
 * `chords` panel for a claim:
 *
 * - **Open:** while the active claim wants the picker (the Chords tool is on), the panel is shown (opened at its
 *   remembered place, brought to the front, its docker expanded) when that becomes true or when the target changes.
 *   When only the active screenset changes (design 3.2) the panel is opened at its place if that screenset does not
 *   hold it yet, and otherwise left alone: the tab order is as the person left it (A6).
 * - **Leaving the tool does not close the panel** (1b): nothing here closes it.
 * - **Closed by the person** (the tab's x or menu Close, or Remove docker) while the claim wants the picker: the session
 *   tells the claim's host (`reportPickerClosed`: the clip editor goes back to the tool it had before). A close under
 *   another tool just closes. A change of screenset is not a close, so only the same screenset's open to closed counts.
 */
export function ChordPanelBridge({
  screenset,
  api,
}: {
  screenset: Screenset;
  api: StageApi | null;
}) {
  const session = useChordSession();
  const wanted = useChordSelector((state) => state.pickerWanted);
  const targetId = useChordSelector((state) => state.target?.id ?? null);
  const screensetId = screenset.id;
  const open = !!dockerHolding(screenset.tree, CHORDS_PANEL);

  const before = useRef<{ wanted: boolean; targetId: string | null; hadApi: boolean } | null>(null);
  useEffect(() => {
    const prev = before.current;
    before.current = { wanted, targetId, hadApi: !!api };
    if (!(wanted && targetId !== null && api)) {
      return;
    }
    const claimChanged =
      !prev || prev.wanted !== wanted || prev.targetId !== targetId || !prev.hadApi;
    if (claimChanged) {
      api.show(CHORDS_PANEL);
    } else if (!api.isOpen(CHORDS_PANEL)) {
      // A screenset flip only: resolve its place, but leave the tab order and the docker as the person left them (A6).
      api.open(CHORDS_PANEL);
    }
  }, [wanted, targetId, screensetId, api]);

  // Is the panel on screen (open, front tab of its docker, docker expanded and visible)? The Stage's own answer
  // (`isShown`), read after every commit of this bridge: a tab switch or collapse changes the screenset the page passes
  // down, and the Stage has rendered it by the time this effect runs (reading it during render would be one step behind).
  // Selection mode (M6c) does nothing while it is false; `setPanelShown` ignores an unchanged value.
  useEffect(() => {
    session.setPanelShown(!!api?.isShown(CHORDS_PANEL));
  });

  const last = useRef({ id: screensetId, open });
  useEffect(() => {
    const before = last.current;
    last.current = { id: screensetId, open };
    if (before.id === screensetId && before.open && !open && session.getState().pickerWanted) {
      session.reportPickerClosed();
    }
  }, [screensetId, open, session]);
  return null;
}
