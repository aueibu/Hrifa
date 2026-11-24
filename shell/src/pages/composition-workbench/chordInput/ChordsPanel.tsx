import { Button } from '@mantine/core';
import { ReadyLine } from '../components/ReadyLine';
import { ChordPickerPanel } from './ChordPickerPanel';
import { useChordSelector, useChordSession } from './ChordSessionProvider';
import { useChordReady } from './useChordReady';
import classes from './ChordsPanel.module.css';

/**
 * The `chords` panel of the workbench page (M6a, M6b): the chord picker bound to the page chord session, framed to
 * fill its docker. The frame carries `data-chord-scope` (the W-20 keys and Esc work with focus here), a header with a
 * Close button that clears the anchor and the ghosts while a target has an anchor (the tab's own close removes the
 * panel), and directly under it the ready line (always present, fixed height). The panel knows nothing of the roll or of
 * any host: it reads the session, so a progression-list host or the Notes editor drives it the same way. Without a
 * target it still auditions; with another tool than Chords it acts on the roll's selection (selection mode).
 */
export function ChordsPanel() {
  const session = useChordSession();
  const closable = useChordSelector((state) => state.target !== null && state.anchor !== null);
  const ready = useChordReady();
  return (
    <section className={classes.frame} data-chord-panel="" data-chord-scope="" aria-label="Chords">
      <div className={classes.header}>
        <span />
        <div className={classes.buttons}>
          {closable && (
            <Button
              size="compact-xs"
              variant="subtle"
              aria-label="Close chord picker"
              onClick={session.closePicker}
            >
              Close
            </Button>
          )}
        </div>
      </div>
      <ReadyLine value={ready} />
      <div className={classes.body}>
        <ChordPickerPanel />
      </div>
    </section>
  );
}
