import { render, screen, userEvent, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompositionSettingsProvider } from '../compositionSettings';
import { DeskProvider } from '../desk';
import { seedDesk } from '../deskTestUtils';
import { resetHistory } from '../history';
import { writeSceneSession } from '../scene/sceneSession';
import { claveBlock, collectionBlock, objectBlock, sceneBlock } from '../scene/sceneTestHelpers';
import { ArrangerPanel } from './ArrangerPanel';
import { mockEngineState } from './sceneEngineMock';

vi.mock('../audio/AudioEngineProvider', async () => {
  const { mockEngine } = await import('./sceneEngineMock');
  return { useAudioEngine: () => mockEngine };
});

async function renderFamily() {
  await seedDesk([
    claveBlock(),
    sceneBlock('scene-1', 'root'),
    collectionBlock('root', ['p', 'kid', 'other', 'm'], {}, 'Main'),
    objectBlock('p', { start: 20, duration: 8 }, 'P'),
    objectBlock('kid', { parentRef: { id: 'p' }, start: 2, duration: 2 }, 'Kid'),
    objectBlock('other', { start: 0, duration: 4 }, 'Other'),
    objectBlock(
      'm',
      { start: 40, duration: 4, mute: true, primaryDataRef: { id: 'clave' } },
      'Muted'
    ),
  ]);
  writeSceneSession({ activeSceneId: 'scene-1', selectedId: null });
  render(
    <CompositionSettingsProvider>
      <DeskProvider>
        <ArrangerPanel />
      </DeskProvider>
    </CompositionSettingsProvider>
  );
  await screen.findByRole('button', { name: 'Block P' });
}

const block = (name: string) => screen.getByRole('button', { name: `Block ${name}` });

beforeEach(() => {
  localStorage.clear();
  resetHistory();
  mockEngineState.reset();
});

describe('parent display (L1b)', () => {
  it('the parent block has a tick at the child start whose hover names the child', async () => {
    await renderFamily();
    const ticks = screen.getAllByTestId('arranger-child-tick');
    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toHaveAttribute('data-info', 'Child starts here: Kid');
    expect(block('P')).toContainElement(ticks[0]);
    // 2 quarters from the parent's start.
    expect(Number.parseFloat(ticks[0].style.left)).toBeGreaterThan(0);
  });

  it('a parented block carries a marker that says whom it follows; others have none', async () => {
    await renderFamily();
    expect(block('Kid').querySelector('[data-testid="arranger-follows"]')).toHaveAttribute(
      'data-info',
      'Follows P'
    );
    expect(block('P').querySelector('[data-testid="arranger-follows"]')).toBeNull();
    expect(block('Other').querySelector('[data-testid="arranger-follows"]')).toBeNull();
  });

  it('the dashed connector shows only while the parent or the child is selected, and tints both', async () => {
    await renderFamily();
    expect(screen.queryByTestId('arranger-relations')).toBeNull();
    await userEvent.click(block('Kid'));
    await waitFor(() => expect(screen.getByTestId('arranger-relations')).toBeInTheDocument());
    expect(document.querySelectorAll('[data-connector]')).toHaveLength(1);
    expect(block('P').className).toMatch(/blockRelated/);
    expect(block('Kid').className).toMatch(/blockRelated/);
    expect(block('Other').className).not.toMatch(/blockRelated/);
    await userEvent.click(block('P'));
    await waitFor(() => expect(document.querySelectorAll('[data-connector]')).toHaveLength(1));
    await userEvent.click(block('Other'));
    await waitFor(() => expect(screen.queryByTestId('arranger-relations')).toBeNull());
  });
});

describe('ghosted muted blocks (L1b)', () => {
  it('a muted block still draws its notes, ghosted, on a dimmed tile', async () => {
    await renderFamily();
    const muted = block('Muted');
    expect(muted).toHaveAttribute('data-muted', 'true');
    const preview = muted.querySelector('[data-testid="arranger-preview"]');
    expect(preview).not.toBeNull();
    expect(preview?.getAttribute('class')).toMatch(/previewMuted/);
  });
});

describe('shared data (W-79)', () => {
  async function renderShared() {
    await seedDesk([
      claveBlock(),
      claveBlock('solo', 'Solo'),
      sceneBlock('scene-1', 'root'),
      collectionBlock('root', ['a', 'b', 'c', 'e', 'f'], {}, 'Main'),
      objectBlock('a', { start: 0, primaryDataRef: { id: 'clave' } }, 'A'),
      objectBlock('b', { start: 4, primaryDataRef: { id: 'clave' } }, 'B'),
      objectBlock('c', { start: 8, primaryDataRef: { id: 'clave' } }, 'C'),
      objectBlock('e', { start: 12, primaryDataRef: { id: 'solo' } }, 'E'),
      objectBlock('f', { start: 16 }, 'F'),
    ]);
    writeSceneSession({ activeSceneId: 'scene-1', selectedId: null });
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <ArrangerPanel />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    await screen.findByRole('button', { name: 'Block A' });
  }
  const badge = (name: string) => block(name).querySelector('[data-testid="arranger-shares"]');

  it('a badge with the count (3 users) and a tooltip on each sharer; none on a lone or empty object', async () => {
    await renderShared();
    expect(badge('A')).toHaveAttribute('title', 'Shares Clave with 2 other objects');
    expect(badge('A')?.textContent).toBe('3');
    expect(badge('C')).not.toBeNull();
    expect(badge('E')).toBeNull();
    expect(badge('F')).toBeNull();
  });

  const marker = (name: string) =>
    block(name).querySelector('[data-testid="arranger-shared-marker"]');

  it('selecting a sharer puts the marker and the gentle tint on the other sharers, not on itself or non-sharers', async () => {
    await renderShared();
    expect(marker('B')).toBeNull();
    await userEvent.click(block('A'));
    await waitFor(() => expect(marker('B')).not.toBeNull());
    expect(marker('C')).not.toBeNull();
    expect(marker('A')).toBeNull();
    expect(marker('E')).toBeNull();
    expect(marker('F')).toBeNull();
    expect(block('B').className).toMatch(/blockRelated/);
    expect(block('C').className).toMatch(/blockRelated/);
    expect(block('A').className).not.toMatch(/blockRelated/);
    expect(block('E').className).not.toMatch(/blockRelated/);
    await userEvent.click(block('E'));
    await waitFor(() => expect(marker('B')).toBeNull());
  });

  it('the title bar shows the name, then the data name; an Empty has no data name', async () => {
    await renderShared();
    const bar = block('A').querySelector('[data-testid="arranger-title-bar"]');
    expect(bar).not.toBeNull();
    expect(bar?.querySelector('[data-testid="arranger-block-name"]')?.textContent).toBe('A');
    expect(bar?.querySelector('[data-testid="arranger-data-name"]')?.textContent).toBe('Clave');
    expect(block('F').querySelector('[data-testid="arranger-data-name"]')).toBeNull();
    expect(bar?.querySelector('[data-testid="arranger-shares"]')).not.toBeNull();
  });
});
