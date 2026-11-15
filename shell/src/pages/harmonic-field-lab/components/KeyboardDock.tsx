/** Thin keyboard dock: one row of keys for the subset, collapsible to a bar. What sounds is lit here and everywhere. */
import { useMemo } from 'react';
import { CHORD_PAGE, dockKeyCount, KEYS, playsChords, playsMelody } from '../audio/keymap';
import { useLabDeveloperOptions } from '../state/developerOptions';
import { linkedScaleOf } from '../state/linkedMelody';
import { retunerLive } from '../state/retuner';
import { ChevronDownIcon } from './icons';
import { Num, Tip, useLab } from './ui';
import classes from './lab.module.css';

export function KeyboardDock({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { base, sounding, chord, setHover, audio, state } = useLab();
  const { keyboardMode, linkedMelody } = state.ui;
  const { shift, page, link } = state.keys;
  const melody = playsMelody(keyboardMode);
  const { rel, repText, repC, ratios } = base;
  const n = rel.length;
  const chords = state.shelf.chords;
  const lastPage = Math.max(0, Math.ceil(chords.length / CHORD_PAGE) - 1);
  const shown = Math.min(page, lastPage);
  const linkedName = linkedMelody && link ? chords.find((c) => c.id === link) : undefined;
  // while a chord is linked the keys play ITS source subset: label them with its pitches (cents in the live
  // Parallel | Relative frame; the ratio text is not derivable cheaply), not with this tab's notes
  const linkedChord = linkedName && !retunerLive(state.retuner) ? linkedName : undefined;
  const [dev] = useLabDeveloperOptions();
  const linkedRoot = state.ui.linkedRoot ?? dev.linkedRootDefault;
  const sc = useMemo(() => linkedScaleOf(linkedChord, linkedRoot), [linkedChord, linkedRoot]);
  const relative = state.ui.modePlayback === 'relative';
  const nKeys = sc ? sc.rel.length : n;
  const count = dockKeyCount(nKeys);
  const keys = Array.from({ length: count }, (_, i) => {
    if (sc) {
      const base0 = (relative ? sc.rootC : 0) + sc.rel[i % nKeys] + Math.floor(i / nKeys) * sc.repC;
      return { ratio: `${base0.toFixed(1)} c`, c: base0 + shift * sc.repC, src: -1 };
    }
    return i < n
      ? { ratio: ratios[rel[i].src], c: rel[i].c + shift * repC, src: rel[i].src }
      : { ratio: repText, c: repC + shift * repC, src: rel[0]?.src ?? -1 };
  });
  const hold = (slot: number) => {
    audio.press(slot);
    const up = () => {
      audio.release(slot);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const soundingText = [...sounding]
    .sort((a, b) => base.field[a].c - base.field[b].c)
    .map((i) => ratios[i])
    .join(' · ');
  return (
    <section className={classes.dock} data-open={open} aria-label="Keyboard">
      <Tip k="dockToggle" as="control">
        <button
          type="button"
          className={classes.dockToggle}
          aria-expanded={open}
          aria-label="Keyboard"
          onClick={onToggle}
        >
          <span className={classes.chevron} data-open={open}>
            <ChevronDownIcon />
          </span>
          <span>Keys</span>
        </button>
      </Tip>
      <span className={classes.dockStatus} data-testid="kb-mode">
        {{ notes: 'Notes', chords: 'Chords', split: 'Split' }[keyboardMode]}
        {retunerLive(state.retuner) ? ' (retuner)' : ''}
      </span>
      <span className={classes.dockStatus} data-testid="oct-shift" aria-label="Octave shift">
        Oct {shift > 0 ? `+${shift}` : shift}
      </span>
      {playsChords(keyboardMode) && (
        <span className={classes.dockStatus} data-testid="shelf-page">
          Shelf {chords.length === 0 ? 0 : shown * CHORD_PAGE + 1}-
          {Math.min(chords.length, (shown + 1) * CHORD_PAGE)} of {chords.length}
          {linkedName ? `, melody of ${linkedName.name}` : ''}
        </span>
      )}
      {open ? (
        <div className={classes.keys} role="group" aria-label="Subset keys">
          {n === 0 && <span className={classes.dockStatus}>Select notes to play them here</span>}
          {keys.map((k, i) => {
            const lit = k.src >= 0 && sounding.has(k.src);
            const inChord = k.src >= 0 && chord.has(k.src);
            return (
              <button
                key={i}
                type="button"
                className={classes.key}
                data-lit={lit}
                data-chord={inChord}
                aria-pressed={lit}
                aria-label={`${k.ratio}, ${k.c.toFixed(1)} cents`}
                onPointerDown={(e) => {
                  if (e.button === 0) {
                    hold(i);
                  }
                }}
                onKeyDown={(e) => {
                  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                    audio.press(i);
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    audio.release(i);
                  }
                }}
                onMouseEnter={() => k.src >= 0 && setHover(k.src)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => k.src >= 0 && setHover(k.src)}
                onBlur={() => {
                  setHover(null);
                  audio.release(i);
                }}
              >
                {melody && <span className={classes.keyHint}>{KEYS[i]}</span>}
                <Num>{k.ratio}</Num>
                {shift !== 0 && (
                  <span className={classes.keyHint} data-testid="key-shift">
                    {shift > 0 ? `+${shift}` : shift}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <span className={classes.dockStatus}>
          sounding <Num>{soundingText || 'nothing'}</Num>
        </span>
      )}
    </section>
  );
}
