import { fireEvent, render, screen, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';

// WebGL "exists" but the renderer cannot be created (a context limit, a blocked GPU)
vi.mock('./components/webgl', () => ({ hasWebGL: () => true, resetWebGLProbe: () => undefined }));
vi.mock('three', async (orig) => {
  const real = await orig<typeof import('three')>();
  return {
    ...real,
    WebGLRenderer: class {
      constructor() {
        throw new Error('Error creating WebGL context.');
      }
    },
  };
});

beforeEach(() => window.localStorage.clear());

describe('3D lattice without a usable renderer', () => {
  it('falls back to the no-WebGL note instead of crashing, and 2D still works', async () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Analysis panels' })).getByRole('tab', {
        name: /Visualizer 1/,
      })
    );
    fireEvent.click(screen.getByRole('radio', { name: '3D' }));
    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent(/needs WebGL/);
    fireEvent.click(screen.getByRole('radio', { name: '2D' }));
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.getByRole('group', { name: /Lattice of the field/ })).toBeInTheDocument();
  });
});
