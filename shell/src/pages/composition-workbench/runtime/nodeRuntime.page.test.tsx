import { createElement } from 'react';
import { fireEvent, render, screen, userEvent } from '@test-utils';
import { describe, expect, it, vi } from 'vitest';
import { CompositionWorkbenchPage } from '../../CompositionWorkbench.page';

// Counts how often the Interference node (a source node: it takes no outputs) renders.
const renders = vi.hoisted(() => ({ interference: 0 }));

vi.mock('../components/InterferenceNode', async (importOriginal) => {
  const original = await importOriginal<typeof import('../components/InterferenceNode')>();
  return {
    ...original,
    InterferenceNode: (props: Parameters<typeof original.InterferenceNode>[0]) => {
      renders.interference += 1;
      return createElement(original.InterferenceNode, props);
    },
  };
});

// Counts runner renders per node: the runner calls `useNodeEvaluation` once per render.
const evaluations = vi.hoisted(() => ({ byNode: {} as Record<string, number> }));

vi.mock('./useNodeEvaluation', async (importOriginal) => {
  const original = await importOriginal<typeof import('./useNodeEvaluation')>();
  return {
    ...original,
    useNodeEvaluation: ((nodeId: string, ...rest: unknown[]) => {
      evaluations.byNode[nodeId] = (evaluations.byNode[nodeId] ?? 0) + 1;
      return (original.useNodeEvaluation as (...args: unknown[]) => unknown)(nodeId, ...rest);
    }) as typeof original.useNodeEvaluation,
  };
});

describe('node runtime', () => {
  it('a publish from one node does not re-render a source node, and a routed node still gets the output', async () => {
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

  it('a source node runner is not re-rendered by another node publishing', async () => {
    const user = userEvent.setup();
    localStorage.clear();
    render(<CompositionWorkbenchPage />);
    await user.click(screen.getByRole('button', { name: /^Pitch List/ }));
    const interferenceBefore = evaluations.byNode['interference'];
    const pitchBefore = evaluations.byNode['pitch-list'];
    expect(interferenceBefore).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole('textbox', { name: 'Pitch values' }), {
      target: { value: '60 64 67' },
    });
    // The edited node evaluated again; the unrelated source node did not.
    expect(evaluations.byNode['pitch-list']).toBeGreaterThan(pitchBefore);
    expect(evaluations.byNode['interference']).toBe(interferenceBefore);
  }, 30_000);
});
