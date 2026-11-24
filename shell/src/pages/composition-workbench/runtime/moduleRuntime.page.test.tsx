import { createElement } from 'react';
import { fireEvent, render, screen, userEvent } from '@test-utils';
import { describe, expect, it, vi } from 'vitest';
import { CompositionWorkbenchPage } from '../../CompositionWorkbench.page';

// Counts how often the Interference module (a source module: it takes no outputs) renders.
const renders = vi.hoisted(() => ({ interference: 0 }));

vi.mock('../components/InterferenceModule', async (importOriginal) => {
  const original = await importOriginal<typeof import('../components/InterferenceModule')>();
  return {
    ...original,
    InterferenceModule: (props: Parameters<typeof original.InterferenceModule>[0]) => {
      renders.interference += 1;
      return createElement(original.InterferenceModule, props);
    },
  };
});

// Counts runner renders per module: the runner calls `useModuleEvaluation` once per render.
const evaluations = vi.hoisted(() => ({ byModule: {} as Record<string, number> }));

vi.mock('./useModuleEvaluation', async (importOriginal) => {
  const original = await importOriginal<typeof import('./useModuleEvaluation')>();
  return {
    ...original,
    useModuleEvaluation: ((moduleId: string, ...rest: unknown[]) => {
      evaluations.byModule[moduleId] = (evaluations.byModule[moduleId] ?? 0) + 1;
      return (original.useModuleEvaluation as (...args: unknown[]) => unknown)(moduleId, ...rest);
    }) as typeof original.useModuleEvaluation,
  };
});

describe('module runtime', () => {
  it('a publish from one module does not re-render a source module, and a routed module still gets the output', async () => {
    const user = userEvent.setup();
    localStorage.clear();
    render(<CompositionWorkbenchPage />);

    // Route the rhythm from Interference into Melodicization (22 notes with the default resultant).
    await user.click(screen.getByRole('button', { name: /^Melodicization/ }));
    await user.click(screen.getByRole('button', { name: 'Rhythm source' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Interference' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Resultant' }));
    await user.click(screen.getByRole('button', { name: 'Pitch source' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Pitch List · Pitches' }));
    expect(screen.getByText('22 notes', { selector: '.mantine-Badge-label' })).toBeInTheDocument();

    // Open Pitch List, then edit it: it publishes a new output. Interference must not render again.
    await user.click(screen.getByRole('button', { name: /^Pitch List/ }));
    const rendersBefore = renders.interference;
    expect(rendersBefore).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole('textbox', { name: 'Pitch values' }), {
      target: { value: '60 64 67' },
    });
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toHaveValue('60 64 67');
    expect(renders.interference).toBe(rendersBefore);

    // Interference changes its resultant: Melodicization (which reads outputs) gets the new one.
    await user.click(screen.getByRole('button', { name: /^Interference/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Generator 1 pattern' }), {
      target: { value: '4' },
    });
    await user.click(screen.getByRole('button', { name: /^Melodicization/ }));
    expect(
      screen.queryByText('22 notes', { selector: '.mantine-Badge-label' })
    ).not.toBeInTheDocument();
  }, 30_000);

  it('a source module runner is not re-rendered by another module publishing', async () => {
    const user = userEvent.setup();
    localStorage.clear();
    render(<CompositionWorkbenchPage />);
    await user.click(screen.getByRole('button', { name: /^Pitch List/ }));
    const interferenceBefore = evaluations.byModule['interference'];
    const pitchBefore = evaluations.byModule['pitch-list'];
    expect(interferenceBefore).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole('textbox', { name: 'Pitch values' }), {
      target: { value: '60 64 67' },
    });
    // The edited module evaluated again; the unrelated source module did not.
    expect(evaluations.byModule['pitch-list']).toBeGreaterThan(pitchBefore);
    expect(evaluations.byModule['interference']).toBe(interferenceBefore);
  }, 30_000);
});
