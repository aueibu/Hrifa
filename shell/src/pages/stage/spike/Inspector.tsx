import { CloseIcon } from '../icons';
/**
 * The spike inspector region: left of the Stage, built entirely from the kit (one `KitScope`, two `Panel`s). It reads
 * the demo selection: clicking a note in the roll or a clip on the canvas selects it. Compact density only (a persisted
 * density choice is not wanted in the spike).
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
  return (
    <Panel
      title="Selected note"
      tools={
        <StripTool label="Clear note selection" disabled={!note} onClick={() => select(null)}>
          <CloseIcon />
        </StripTool>
      }
    >
      {!note ? (
        <p className={classes.hint}>Click a note in the roll.</p>
      ) : (
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
      )}
    </Panel>
  );
}

function ClipPanel() {
  const { clips, selection, select, updateClip, resetClip, duplicateClip } = useSpike();
  const clip = selection?.kind === 'clip' ? clips.find((c) => c.id === selection.id) : undefined;
  return (
    <Panel
      title="Selected clip"
      tools={
        <StripTool label="Clear clip selection" disabled={!clip} onClick={() => select(null)}>
          <CloseIcon />
        </StripTool>
      }
    >
      {!clip ? (
        <p className={classes.hint}>Click a clip on the canvas.</p>
      ) : (
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
      )}
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
        <NotePanel />
        <ClipPanel />
      </KitScope>
    </aside>
  );
}
