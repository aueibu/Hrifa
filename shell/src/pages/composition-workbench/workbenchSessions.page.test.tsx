import { act, render, screen, userEvent, waitFor, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompositionWorkbenchPage } from '../CompositionWorkbench.page';
import type { ChordSession } from './chordInput/chordSession';
import { CLIP_SLOT, type ClipEditorSession } from './clipEditorSession';
import { seedDesk } from './deskTestUtils';
import { resetHistory } from './history';
import { storeDefaultScreensets } from './layout/screensetFixtures';
import type { NoteEventValue } from './melodicization';
import { packet } from './model';
import { musicalDuration, musicalPosition } from './musicalTime';
import type { NoteSelection } from './noteSelection';
import type { Snippet } from './snippet';
import type { WorkbenchSelectionValue } from './WorkbenchSelection';

// The page mounts the real `WorkbenchSessions`; this wrapper hands it sessions the test can see and
// renders a probe of the selection chain inside it, exactly where the page's Stage and editors sit.
const seen = vi.hoisted(() => ({
  chord: null as unknown,
  clip: null as unknown,
  props: [] as Array<{ inspectorTarget: unknown; clipId: unknown }>,
  mounts: 0,
  selection: null as unknown,
}));

vi.mock('./WorkbenchSessions', async (importOriginal) => {
  const original = await importOriginal<typeof import('./WorkbenchSessions')>();
  const { useEffect, useRef } = await import('react');
  const { ChordSession: Chord } = await import('./chordInput/chordSession');
  const { ClipEditorSession: Clip } = await import('./clipEditorSession');
  const { useWorkbenchSelection: useSelection } = await import('./WorkbenchSelection');
  function Probe() {
    seen.selection = useSelection();
    return null;
  }
  return {
    ...original,
    WorkbenchSessions(props: Parameters<typeof original.WorkbenchSessions>[0]) {
      const chord = useRef<InstanceType<typeof Chord>>(null as never);
      const clip = useRef<InstanceType<typeof Clip>>(null as never);
      chord.current ??= new Chord();
      clip.current ??= new Clip();
      seen.chord = chord.current;
      seen.clip = clip.current;
      seen.props.push({ inspectorTarget: props.inspectorTarget, clipId: props.clipId });
      useEffect(() => {
        seen.mounts += 1;
      }, []);
      return (
        <original.WorkbenchSessions
          {...props}
          chordSession={chord.current}
          clipEditorSession={clip.current}
        >
          <Probe />
          {props.children}
        </original.WorkbenchSessions>
      );
    },
  };
});

function noteClip(id: string, name: string): Snippet {
  const value: NoteEventValue = {
    onset: musicalPosition(0),
    interOnset: musicalDuration(1),
    duration: musicalDuration(1),
    pitches: [6000],
    velocity: 1,
  };
  return {
    schemaVersion: 1,
    id,
    name,
    createdAt: '2026-11-11T00:00:00Z',
    packet: {
      ...packet('events', 'note', [{ id: `${id}:n`, value, label: 'n', provenance: [] }]),
      frame: {
        topology: 'linear',
        unit: 'quarterNote',
        extent: 8,
        origin: 0,
        musicalExtent: musicalDuration(8),
        musicalOrigin: musicalPosition(0),
      },
    },
  };
}

async function seed() {
  await seedDesk([noteClip('clip-a', 'Alpha'), noteClip('clip-b', 'Beta')]);
  storeDefaultScreensets({ active: 'desk' });
}

async function openClip(user: ReturnType<typeof userEvent.setup>, name: string) {
  const input = await screen.findByDisplayValue(name);
  const card = input.closest('div[class*="card"]') as HTMLElement;
  await user.dblClick(within(card).getByText(/^events \| note/));
}

const chordSession = () => seen.chord as ChordSession;
const clipSession = () => seen.clip as ClipEditorSession;
const selection = () => seen.selection as WorkbenchSelectionValue | null;

describe('the page mounts WorkbenchSessions', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
    seen.chord = null;
    seen.clip = null;
    seen.props = [];
    seen.mounts = 0;
    seen.selection = null;
  });

  it('the open clip editor claims the page chord session and resets it per clip, without remounting the desk', async () => {
    const user = userEvent.setup();
    await seed();
    render(<CompositionWorkbenchPage />);
    const alphaName = await screen.findByDisplayValue('Alpha');
    expect(chordSession().getState().target).toBeNull();

    await openClip(user, 'Alpha');
    await screen.findByRole('group', { name: /Note clip piano roll/ });
    // The editor in the page claims the PAGE session (it would claim a private one otherwise).
    expect(chordSession().getState().target?.id).toBe('clip-a');
    expect(clipSession().openClipId).toBe('clip-a');

    act(() => {
      chordSession().setAnchor({ pitchMidicents: 6000, start: 0, step: 1 });
    });
    expect(chordSession().getState().anchor).not.toBeNull();

    // Switching clips: the chord state resets (the target changes) and the clip state is B's,
    // while the desk and the provider stay mounted (the same DOM node, one provider mount).
    await openClip(user, 'Beta');
    await waitFor(() => expect(chordSession().getState().target?.id).toBe('clip-b'));
    expect(chordSession().getState().anchor).toBeNull();
    expect(clipSession().openClipId).toBe('clip-b');
    expect(screen.getByDisplayValue('Alpha')).toBe(alphaName);
    expect(seen.mounts).toBe(1);
  }, 20_000);

  it('releases the claim when the clip editor closes, so the chord state is gone', async () => {
    const user = userEvent.setup();
    await seed();
    render(<CompositionWorkbenchPage />);
    await openClip(user, 'Alpha');
    await screen.findByRole('group', { name: /Note clip piano roll/ });
    act(() => {
      chordSession().setAnchor({ pitchMidicents: 6000, start: 0, step: 1 });
    });
    // Selecting a module (the canvas screenset) clears the clip target and unmounts the editor.
    await user.click(screen.getByRole('tab', { name: 'Canvas' }));
    await user.click(
      within(screen.getByLabelText('Composition canvas')).getByRole('button', {
        name: /^Interference/,
      })
    );
    await waitFor(() => expect(chordSession().getState().target).toBeNull());
    expect(chordSession().getState().anchor).toBeNull();
    expect(clipSession().openClipId).toBeNull();
  }, 20_000);

  it('useWorkbenchSelection resolves the live module, clip and note targets', async () => {
    const user = userEvent.setup();
    await seed();
    render(<CompositionWorkbenchPage />);
    await screen.findByDisplayValue('Alpha');
    // No clip open: the stored module target (the default Interference module).
    expect(selection()?.chain.map((node) => node.level)).toEqual(['module']);
    expect(selection()?.chain[0]).toMatchObject({ level: 'module', instanceId: 'interference' });

    await openClip(user, 'Alpha');
    await screen.findByRole('group', { name: /Note clip piano roll/ });
    // A clip is open: nothing else is selected, so the module falls back to the canvas.
    await waitFor(() =>
      expect(selection()?.chain).toEqual([{ level: 'clip', clipId: 'clip-a' }, { level: 'canvas' }])
    );
    expect(seen.props.at(-1)).toMatchObject({ clipId: 'clip-a' });

    // A held note selection is the editor's own, read from the shared clip session.
    const selected: NoteSelection = { ids: ['clip-a:n'], range: null };
    act(() => {
      clipSession().write('clip-a', CLIP_SLOT.shownSelection, () => null, selected);
    });
    await waitFor(() =>
      expect(selection()?.chain[0]).toMatchObject({ level: 'note', clipId: 'clip-a' })
    );
    expect(selection()?.parent(selection()!.chain[0])).toMatchObject({ level: 'clip' });
  }, 20_000);
});
