import { CloseIcon } from '../icons';
/**
 * The spike inspector region: left of the Stage, built entirely from the kit (one `KitScope`, `Panel`s chosen by the
 * selection). It reads the demo selection: clicking a note in the roll or a clip on the canvas selects it. Compact
 * density only (a persisted density choice is not wanted in the spike).
 */
import {
  ActionButton,
  Actions,
  KitScope,
  Num,
  NumberField,
  Panel,
  Row,
  Section,
  SegmentedField,
  SelectField,
  StripTool,
  TextField,
  Tip,
  Toggle,
} from '../kit';
import { pitchName, useSpike, type ClipGrid, type ClipMode } from './state';
import classes from './spike.module.css';

const MODES: readonly ClipMode[] = ['Ionian', 'Dorian', 'Aeolian'];
const GRIDS: readonly ClipGrid[] = ['1/4', '1/8', '1/16'];

const num = (v: number | string, fallback: number) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

function NotePanel() {
  const { notes, selection, select, updateNote, deleteNote, resetNote } = useSpike();
  const ids = selection?.kind === 'note' ? selection.ids : [];
  const note = notes.find((n) => n.id === ids[0]);
  if (!note) {
    return null;
  }
  return (
    <Panel
      title="Selected note"
      tools={
        <StripTool label="Clear note selection" onClick={() => select(null)}>
          <CloseIcon />
        </StripTool>
      }
    >
      <>
        <Section
          heading="Pitch"
          aside={<Num muted>{ids.length > 1 ? `${ids.length} selected` : '12-EDO'}</Num>}
        >
          <Row name="Name">
            <Num>{pitchName(note.pitch)}</Num>
          </Row>
          <Row name="MIDI">
            <NumberField
              min={0}
              max={127}
              value={note.pitch}
              onChange={(v) => updateNote(note.id, { pitch: Math.round(num(v, note.pitch)) })}
            />
          </Row>
        </Section>
        <Section heading="Time">
          <Row name="Start (q)">
            <NumberField
              wide
              min={0}
              value={note.start}
              onChange={(v) => updateNote(note.id, { start: Math.max(0, num(v, note.start)) })}
            />
          </Row>
          <Row name="Length (q)">
            <NumberField
              wide
              min={0.0625}
              value={note.duration}
              onChange={(v) =>
                updateNote(note.id, { duration: Math.max(0.0625, num(v, note.duration)) })
              }
            />
          </Row>
          <Row name="Velocity (%)">
            <NumberField
              min={0}
              max={100}
              value={Math.round(note.velocity * 100)}
              onChange={(v) =>
                updateNote(note.id, {
                  velocity: Math.min(1, Math.max(0, num(v, note.velocity * 100) / 100)),
                })
              }
            />
          </Row>
          <Row name="Playback">
            <Tip
              as="control"
              term="Muted"
              text="A muted note stays in the clip but is skipped when it plays."
            >
              <Toggle
                pressed={note.muted}
                onPressedChange={(m) => updateNote(note.id, { muted: m })}
              >
                Muted
              </Toggle>
            </Tip>
          </Row>
        </Section>
        <Actions>
          <ActionButton onClick={() => resetNote(note.id)}>Reset</ActionButton>
          <ActionButton onClick={() => deleteNote(note.id)}>Delete</ActionButton>
        </Actions>
      </>
    </Panel>
  );
}

function ClipPanel({ clipId, context }: { clipId: string; context?: boolean }) {
  const { clips, select, updateClip, resetClip, duplicateClip } = useSpike();
  const clip = clips.find((c) => c.id === clipId);
  if (!clip) {
    return null;
  }
  return (
    <Panel
      title={context ? 'Clip' : 'Selected clip'}
      tools={
        <StripTool
          label={context ? 'Clear selection' : 'Clear clip selection'}
          onClick={() => select(null)}
        >
          <CloseIcon />
        </StripTool>
      }
    >
      <>
        <Section heading="Clip" aside={<Num muted>{clip.id}</Num>}>
          <Row name="Name" fill>
            <TextField value={clip.name} onChange={(v) => updateClip(clip.id, { name: v })} />
          </Row>
          <Row name="Bars">
            <NumberField
              min={1}
              max={64}
              value={clip.bars}
              onChange={(v) =>
                updateClip(clip.id, { bars: Math.max(1, Math.round(num(v, clip.bars))) })
              }
            />
          </Row>
          <Row name="Mode">
            <SelectField
              value={clip.mode}
              data={MODES}
              onChange={(v) => updateClip(clip.id, { mode: v as ClipMode })}
            />
          </Row>
          <Row name="Grid" fill>
            <SegmentedField
              value={clip.grid}
              data={GRIDS}
              onChange={(v) => updateClip(clip.id, { grid: v as ClipGrid })}
            />
          </Row>
          <Row name="Playback">
            <Toggle pressed={clip.loop} onPressedChange={(l) => updateClip(clip.id, { loop: l })}>
              Loop
            </Toggle>
          </Row>
        </Section>
        <Actions>
          <ActionButton onClick={() => resetClip(clip.id)}>Reset</ActionButton>
          <ActionButton onClick={() => duplicateClip(clip.id)}>Duplicate</ActionButton>
        </Actions>
      </>
    </Panel>
  );
}

/**
 * Dynamic panels, most general on top: nothing selected shows one hint; a clip shows only its panel; a note shows its
 * parent clip's panel and the note's panel under it. No reserved empty panels.
 */
function Panels() {
  const { notes, selection } = useSpike();
  if (selection?.kind === 'clip') {
    return <ClipPanel clipId={selection.id} />;
  }
  if (selection?.kind === 'note') {
    const note = notes.find((n) => n.id === selection.ids[0]);
    if (note) {
      return (
        <>
          <ClipPanel clipId={note.clipId} context />
          <NotePanel />
        </>
      );
    }
  }
  return (
    <Panel title="Inspector">
      <p className={classes.hint}>Select a clip on the canvas or a note in the roll.</p>
    </Panel>
  );
}

/** Width of the region in rem (the page subtracts it from the window width before the Stage fits columns). */
export const INSPECTOR_REM = 17;

export function SpikeInspector() {
  return (
    <aside
      className={classes.inspector}
      style={{ width: `${INSPECTOR_REM}rem` }}
      aria-label="Inspector"
      data-inspector
    >
      <KitScope fill>
        <Panels />
      </KitScope>
    </aside>
  );
}
