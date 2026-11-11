import { render } from '@test-utils';
import type { TrackNote } from '../rhythmEdit';
import { NoteGuides, ProgramTrack, trackBlocks } from './ProgramTrack';

const tick = (action: string, block: number): TrackNote<string> => ({
  state: 'tick',
  action,
  block,
});
const skipped: TrackNote<string> = { state: 'skipped' };
const waiting: TrackNote<string> = { state: 'waiting' };

describe('program track', () => {
  it('spans each block from its first tick to its last, covering skipped notes between', () => {
    // Notes 2 each. Ticks on notes 2, 4 and 6 at rate 2: blocks 0 (notes 2 and 4) and 1 (note 6).
    const notes = [waiting, tick('x', 0), skipped, tick('x', 0), skipped, tick('r', 1)];
    expect(trackBlocks([2, 2, 2, 2, 2, 2], notes)).toEqual([
      { block: 0, start: 2, end: 8, ticks: 2 },
      { block: 1, start: 10, end: 12, ticks: 1 },
    ]);
  });

  it('draws no brackets for ticks that belong to no block, as with rules', () => {
    expect(trackBlocks([1, 1], [{ state: 'tick', action: 'r' }, skipped])).toEqual([]);
  });

  it('draws a cell per note, an action on ticks, a dot where skipped, and a bracket per block', () => {
    const notes = [waiting, tick('x', 0), skipped, tick('r', 1)];
    const { container, getByText } = render(
      <ProgramTrack
        label="Structure"
        detail="phase 1, rate 2"
        lengths={[1, 1, 1, 1]}
        notes={notes}
      />
    );
    const cells = [...container.querySelectorAll<HTMLElement>('[data-state]')];
    expect(cells.map((cell) => cell.dataset.state)).toEqual(['waiting', 'tick', 'skipped', 'tick']);
    expect(cells.map((cell) => cell.textContent)).toEqual(['', 'x', '·', 'r']);
    expect(container.querySelectorAll('[data-parity]')).toHaveLength(2);
    expect(getByText('Structure · phase 1, rate 2')).toBeTruthy();
  });

  it('draws a guide at every note edge, inside the strip border, so tracks and strip line up', () => {
    const { container } = render(<NoteGuides lengths={[1, 2, 1]} />);
    const guides = [...container.querySelectorAll<HTMLElement>('span')];
    expect(guides.map((guide) => guide.style.left)).toEqual([
      'calc(1px + 0 * (100% - 2px))',
      'calc(1px + 0.25 * (100% - 2px))',
      'calc(1px + 0.75 * (100% - 2px))',
      'calc(1px + 1 * (100% - 2px))',
    ]);
    expect(render(<NoteGuides lengths={[]} />).container.querySelectorAll('span')).toHaveLength(0);
  });
});
