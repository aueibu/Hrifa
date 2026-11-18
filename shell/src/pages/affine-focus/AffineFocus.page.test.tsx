import { render } from '@test-utils';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AffineFocusPage } from '../AffineFocus.page';
import { STORAGE_KEY } from './state';

function renderPage() {
  return render(<AffineFocusPage />);
}

describe('AffineFocusPage', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it('renders the Focus Geometry Stage, immediate family cards, and arithmetic inspector', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Affine Focus Transform Explorer' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('focus-stage')).toBeInTheDocument();
    expect(screen.getByTestId('arithmetic-inspector')).toBeInTheDocument();

    // Default state is 7-note Ptolemy JI with seed (1/1, 5/4, 3/2) -> 3 focus cards
    const cards = screen.getAllByTestId('family-op-card');
    expect(cards).toHaveLength(3);
  });

  it('switches transform domains between Gamut Steps, Log Pitch, Linear Freq, and Subharmonic with distinct outputs', () => {
    renderPage();

    const domainSelect = screen.getByLabelText('Transform domain');

    // 1. Default Gamut Steps (f=1/1, a=2) -> first card output {1/1, 9/8, 3/2}
    const firstCardGamut = screen.getAllByTestId('family-op-card')[0];
    expect(firstCardGamut).toHaveTextContent('1/1 9/8 3/2');

    // 2. Switch to Log Pitch -> first card output {1/1, 9/8, 25/16}
    fireEvent.change(domainSelect, { target: { value: 'log-pitch' } });
    const firstCardLog = screen.getAllByTestId('family-op-card')[0];
    expect(firstCardLog).toHaveTextContent('1/1 9/8 25/16');

    // 3. Switch to Linear Freq -> first card output {1/1, 3/2} (folded 2/1 -> 1/1)
    fireEvent.change(domainSelect, { target: { value: 'linear-freq' } });
    const firstCardLin = screen.getAllByTestId('family-op-card')[0];
    expect(firstCardLin).toHaveTextContent('1/1 3/2');

    // 4. Switch to Subharmonic -> first card output {1/1, 3/2, 5/3}
    fireEvent.change(domainSelect, { target: { value: 'subharmonic' } });
    const firstCardSub = screen.getAllByTestId('family-op-card')[0];
    expect(firstCardSub).toHaveTextContent('1/1 3/2 5/3');
  });

  it('steps through a trajectory chain and switches to Orbits & Closure and Dual-Focus views', () => {
    renderPage();

    const firstCard = screen.getAllByTestId('family-op-card')[0];
    const stepBtn = within(firstCard).getByRole('button', { name: 'Step →' });
    fireEvent.click(stepBtn);

    const trajBox = screen.getByTestId('trajectory-chain');
    expect(trajBox).toHaveTextContent('Walked Trajectory Chain (2 states)');
    expect(trajBox).toHaveTextContent('S1');

    // Trajectory voice trace strip renders 3 voice lines and both trace toggles
    const traceStrip = screen.getByTestId('trajectory-trace-strip');
    expect(within(traceStrip).getByTestId('trace-voice-0')).toBeInTheDocument();
    expect(within(traceStrip).getByTestId('trace-voice-1')).toBeInTheDocument();
    expect(within(traceStrip).getByTestId('trace-voice-2')).toBeInTheDocument();

    const smoothestRadio = within(trajBox).getByRole('radio', { name: 'Smoothest' });
    fireEvent.click(smoothestRadio);
    expect(smoothestRadio).toBeChecked();

    const foldRadio = within(trajBox).getByRole('radio', { name: 'Fold [0, R)' });
    fireEvent.click(foldRadio);
    expect(foldRadio).toBeChecked();

    // Switch to Orbits & Closure tab
    const orbitsRadio = screen.getByRole('radio', { name: /Orbits & Closure/i });
    fireEvent.click(orbitsRadio);
    expect(screen.getByTestId('closure-summary')).toHaveTextContent(/Closure saturated/i);

    // Switch to Dual-Focus Solver tab
    const dualRadio = screen.getByRole('radio', { name: /Dual-Focus Solver/i });
    fireEvent.click(dualRadio);
    expect(screen.getByTestId('dual-focus-controls')).toBeInTheDocument();
  });

  it('loads the Voice-Trace Drift Demo preset with pre-walked S0..S4 chain and (±kR) octave tags', () => {
    renderPage();

    const presetSelect = screen.getByLabelText('Scenario preset');
    fireEvent.change(presetSelect, { target: { value: 'voice-trace-drift' } });

    const trajBox = screen.getByTestId('trajectory-chain');
    expect(trajBox).toHaveTextContent('Walked Trajectory Chain (5 states)');
    expect(trajBox).toHaveTextContent('S4');

    const traceStrip = screen.getByTestId('trajectory-trace-strip');
    const tags = within(traceStrip).getAllByTestId('trace-octave-tag');
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.some((el) => el.textContent?.includes('−1R'))).toBe(true);
    expect(tags.some((el) => el.textContent?.includes('+1R'))).toBe(true);
  });
});
