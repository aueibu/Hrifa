import { render, screen, userEvent, waitFor, within } from '@test-utils';
import { compositionWorkbenchStorageKey } from './composition-workbench/persistence';
import { compositionStateKeys } from './composition-workbench/usePersistentState';
import { CompositionWorkbenchPage } from './CompositionWorkbench.page';

function renderPage() {
  localStorage.removeItem(compositionWorkbenchStorageKey);
  Object.values(compositionStateKeys).forEach((key) => localStorage.removeItem(key));
  return render(<CompositionWorkbenchPage />);
}

function renderPersistedPage() {
  return render(<CompositionWorkbenchPage />);
}

function moduleCard(id: string) {
  const identifier = screen.getByText(new RegExp(`\\| ${id}$`));
  const card = identifier.closest('[data-tone]');
  if (!card) {
    throw new Error(`No module card for ${id}`);
  }
  return card as HTMLElement;
}

async function openConstruction(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Construction' }));
}

async function openCompositionModule(
  user: ReturnType<typeof userEvent.setup>,
  name: 'Interference' | 'Pitch List' | 'Melodicization'
) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
}

async function setVolumeToThirty(user: ReturnType<typeof userEvent.setup>, accessibleName: string) {
  const slider = screen.getByRole('slider', { name: accessibleName });
  slider.focus();
  for (let step = Number(slider.getAttribute('aria-valuenow')); step < 30; step += 1) {
    await user.keyboard('{ArrowRight}');
  }
  expect(slider).toHaveAttribute('aria-valuenow', '30');
}

describe('CompositionWorkbenchPage', () => {
  it('opens in the module-first composition view', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: 'Composition' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('heading', { name: 'Interference' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Construction' })).not.toBeInTheDocument();
  });

  it('keeps the lower-level patch in the Construction view', async () => {
    const user = userEvent.setup();
    renderPage();
    await openConstruction(user);
    expect(screen.getAllByText('Euclidean Rhythm').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/^Pattern /)).toHaveLength(3);
  });

  it('generates the default three-generator interference resultant', () => {
    renderPage();
    expect(
      screen.getByLabelText('Resultant durations 2 1 1 1 1 2 1 1 2 2 1 1 2 2 1 1 2 1 1 1 1 2')
    ).toBeInTheDocument();
    expect(screen.getAllByText('LCM 30').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Preview/ })).toBeEnabled();
  });

  it('offers an optional grouping metronome', async () => {
    const user = userEvent.setup();
    renderPage();
    const metronome = screen.getByRole('switch', { name: /Grouping metronome/ });
    const previewVolume = screen.getByRole('slider', { name: 'Interference preview volume' });
    const volume = screen.getByRole('slider', { name: 'Metronome volume' });
    expect(metronome).not.toBeChecked();
    expect(volume).not.toHaveAttribute('aria-disabled');
    await setVolumeToThirty(user, 'Interference preview volume');
    await setVolumeToThirty(user, 'Metronome volume');
    await user.click(metronome);
    expect(metronome).toBeChecked();
    expect(previewVolume).toHaveAttribute('aria-valuenow', '30');
    expect(volume).toHaveAttribute('aria-valuenow', '30');
  });

  it('supports adding another authored generator list', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '+ Generator' }));
    expect(screen.getByRole('textbox', { name: 'Generator 4 pattern' })).toHaveValue('6');
    expect(screen.getByRole('button', { name: 'Remove Generator 4' })).toBeEnabled();
  });

  it('uses the modular lane grid as the composition navigator', async () => {
    const user = userEvent.setup();
    renderPage();
    const grid = screen.getByLabelText('Composition modular lane grid');
    expect(grid).toBeInTheDocument();
    expect(
      Array.from(grid.querySelectorAll('[data-module-slot="true"]')).map(
        (slot) => (slot as HTMLElement).style.gridRow
      )
    ).toEqual(['1', '1', '1']);
    expect(within(grid).queryByRole('button', { name: /Note events/ })).not.toBeInTheDocument();
    expect(within(grid).getByRole('button', { name: /^Melodicization/ })).toHaveTextContent(
      'Notes | 0'
    );
    expect(screen.getByRole('button', { name: 'Select lane 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select lane 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select lane 3' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select lane 2' }));
    expect(screen.getByRole('heading', { name: 'Lane 2' })).toBeInTheDocument();
    await openCompositionModule(user, 'Pitch List');
    expect(screen.getByRole('heading', { name: 'Pitch List', level: 2 })).toBeInTheDocument();
    await openCompositionModule(user, 'Melodicization');
    const moduleLane = screen.getByRole('combobox', { name: 'Melodicization module lane' });
    expect(moduleLane).toHaveValue('3');
    await user.click(moduleLane);
    await user.click(screen.getByRole('option', { name: '1' }));
    expect(
      within(screen.getByLabelText('Composition modular lane grid')).getByRole('button', {
        name: /^Melodicization/,
      })
    ).toHaveAttribute('data-lane', '1');
    await waitFor(() =>
      expect(localStorage.getItem(compositionStateKeys.compositionInstances)).toContain(
        '"moduleId":"melodicization","laneId":1'
      )
    );
    await openCompositionModule(user, 'Interference');
    expect(screen.getByRole('heading', { name: 'Interference', level: 2 })).toBeInTheDocument();
  }, 15_000);

  it('removes modules and adds them back to a selected lane', async () => {
    const user = userEvent.setup();
    renderPage();
    const grid = screen.getByLabelText('Composition modular lane grid');

    await openCompositionModule(user, 'Pitch List');
    await user.click(screen.getByRole('button', { name: 'Remove Pitch List' }));
    expect(within(grid).queryByRole('button', { name: /^Pitch List/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Select lane 3' }));
    await user.click(screen.getByRole('button', { name: 'Add Pitch List' }));
    expect(within(grid).getByRole('button', { name: /^Pitch List/ })).toHaveAttribute(
      'data-lane',
      '3'
    );
    expect(screen.getByRole('heading', { name: 'Pitch List', level: 2 })).toBeInTheDocument();
    await waitFor(() => {
      expect(localStorage.getItem(compositionStateKeys.compositionInstances)).toContain(
        '"moduleId":"pitch-list","laneId":3'
      );
    });
  }, 15_000);

  it('places any number of independently authored module instances', async () => {
    const user = userEvent.setup();
    renderPage();
    const grid = screen.getByLabelText('Composition modular lane grid');

    await user.click(screen.getByRole('button', { name: 'Select lane 1' }));
    await user.click(screen.getByRole('button', { name: 'Add Pitch List' }));
    await user.click(screen.getByRole('button', { name: 'Select lane 1' }));
    await user.click(screen.getByRole('button', { name: 'Add Pitch List' }));

    expect(within(grid).getAllByRole('button', { name: /^Pitch List/ })).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Pitch List 3', level: 2 })).toBeInTheDocument();
    const values = screen.getByRole('textbox', { name: 'Pitch values' });
    await user.clear(values);
    await user.type(values, '72, 75');

    await user.click(within(grid).getByRole('button', { name: /^Pitch List 2/ }));
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toHaveValue(
      '60, 62, 64, 67, 66.5'
    );
    expect(localStorage.getItem(compositionStateKeys.compositionInstances)).toContain(
      '"moduleId":"pitch-list","laneId":1'
    );
  }, 20_000);

  it('keeps duplicate Melodicization receiver bindings independent', async () => {
    const user = userEvent.setup();
    renderPage();
    const grid = screen.getByLabelText('Composition modular lane grid');

    await user.click(screen.getByRole('button', { name: 'Select lane 1' }));
    await user.click(screen.getByRole('button', { name: 'Add Melodicization' }));
    expect(screen.getByRole('heading', { name: 'Melodicization 2', level: 2 })).toBeInTheDocument();

    const secondPitchSource = screen.getByRole('combobox', { name: 'Pitch source' });
    await user.click(secondPitchSource);
    await user.click(screen.getByRole('option', { name: 'Pitch List · Pitches' }));
    expect(secondPitchSource).toHaveValue('Pitch List · Pitches');

    await user.click(within(grid).getByRole('button', { name: /^Melodicization 1/ }));
    expect(screen.getByRole('combobox', { name: 'Pitch source' })).toHaveValue('');
    const firstPitchSource = screen.getByRole('combobox', { name: 'Pitch source' });
    await user.click(firstPitchSource);
    await user.click(screen.getByRole('option', { name: 'Pitch List · Pitches' }));
    expect(
      within(grid).getByRole('button', { name: 'Inspect outlet Pitch List · Pitches' })
    ).toHaveAttribute('title', expect.stringContaining('2 downstream uses'));
    expect(
      within(grid).getByLabelText('Pitch List · Pitches used by 2 routes')
    ).toBeInTheDocument();
    const pitchBranches = within(grid).getAllByRole('button', {
      name: /Select pitch route from Pitch List · Pitches to Melodicization/,
    });
    expect(pitchBranches).toHaveLength(2);
    await user.click(pitchBranches[0]);
    expect(screen.getByText('Route · Pitch input')).toBeInTheDocument();
    expect(within(grid).getByRole('button', { name: /^Pitch List/ })).toHaveAttribute(
      'data-flow-active',
      'true'
    );
    expect(within(grid).getByRole('button', { name: /^Melodicization 1/ })).toHaveAttribute(
      'data-flow-active',
      'true'
    );
    expect(within(grid).getByRole('button', { name: /^Melodicization 2/ })).not.toHaveAttribute(
      'data-flow-active'
    );
    await user.click(within(grid).getByRole('button', { name: /^Melodicization 2/ }));
    expect(screen.getByRole('combobox', { name: 'Pitch source' })).toHaveValue(
      'Pitch List · Pitches'
    );
  }, 20_000);

  it('keeps a removed source visibly missing at its receiver', async () => {
    const user = userEvent.setup();
    renderPage();

    await openCompositionModule(user, 'Melodicization');
    const pitchSource = screen.getByRole('combobox', { name: 'Pitch source' });
    await user.click(pitchSource);
    await user.click(screen.getByRole('option', { name: 'Pitch List · Pitches' }));

    await openCompositionModule(user, 'Pitch List');
    await user.click(screen.getByRole('button', { name: 'Remove Pitch List' }));
    await openCompositionModule(user, 'Melodicization');

    expect(screen.getByRole('combobox', { name: 'Pitch source' })).toHaveValue(
      'Missing source · pitches'
    );
    expect(screen.getByText('Connected source is no longer available.')).toBeInTheDocument();
  }, 15_000);

  it('opens Pitch List with explicit input interpretations', async () => {
    const user = userEvent.setup();
    renderPage();
    await openCompositionModule(user, 'Pitch List');
    expect(screen.getByRole('heading', { name: 'Pitch List' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Read list as' })).toHaveValue('MIDI notes');
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toHaveValue(
      '60, 62, 64, 67, 66.5'
    );
    expect(screen.getByText(/list \| pitch \| midi-note \| pitch-material/)).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Preview gate length' })).toHaveAttribute(
      'aria-valuemax',
      '200'
    );
    const pitchValues = screen.getByRole('textbox', { name: 'Pitch values' });
    await user.clear(pitchValues);
    await user.click(pitchValues);
    await user.paste('60 [60 64 67] 62');
    expect(screen.getByText('3 groups', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
    expect(screen.getByText('5 pitches', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pitch list C4 | C4 E4 G4 | D4' })).toBeInTheDocument();
    await setVolumeToThirty(user, 'Pitch preview volume');
  });

  it('populates one provenance-aware pitch-class group from the Forte catalog', async () => {
    const user = userEvent.setup();
    renderPage();
    await openCompositionModule(user, 'Pitch List');
    await user.click(screen.getByRole('button', { name: 'Browse Forte catalog' }));

    const dialog = screen.getByRole('dialog', { name: 'Forte set-class catalog' });
    expect(within(dialog).getByText('223 of 223 set classes')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('img', { name: 'Pitch-class clock 0 3 7' })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Complement 9-11')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('radio', { name: 'Inversion (I0)' }));
    const transposition = within(dialog).getByRole('combobox', { name: 'Forte set transposition' });
    await user.click(transposition);
    await user.click(screen.getByRole('option', { name: 'T2' }));
    expect(within(dialog).getByText('[2 7 11]')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Replace values' }));

    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toHaveValue('[2 7 11]');
    expect(screen.getByRole('combobox', { name: 'Read list as' })).toHaveValue('Pitch classes');
    expect(screen.getByText('1 groups', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
    expect(screen.getByText('3 pitches', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
    await waitFor(() =>
      expect(localStorage.getItem(compositionStateKeys.pitchCatalogOrigins)).toContain(
        '"forteNumber":"3-11"'
      )
    );
  }, 15_000);

  it('routes rhythm and pitch outputs into Melodicization', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole('button', { name: 'Use in…' })).not.toBeInTheDocument();
    await openCompositionModule(user, 'Melodicization');
    expect(screen.getByRole('heading', { name: 'Melodicization' })).toBeInTheDocument();
    const rhythmSource = screen.getByRole('combobox', { name: 'Rhythm source' });
    await user.click(rhythmSource);
    await user.click(screen.getByRole('option', { name: 'Interference · Resultant' }));
    const pitchSource = screen.getByRole('combobox', { name: 'Pitch source' });
    await user.click(pitchSource);
    await user.click(screen.getByRole('option', { name: 'Pitch List · Pitches' }));

    await setVolumeToThirty(user, 'Melodicization preview volume');

    expect(screen.getByText('22 notes', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
    expect(screen.getByText(/events \| note \| cyclic/)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Melodicization piano roll; 22 notes' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Select rhythm route from Interference · Resultant to Melodicization',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Select pitch route from Pitch List · Pitches to Melodicization',
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Adjust .* route: Identity/ })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show event table' }));
    expect(screen.getByText('1.1.1.00')).toBeInTheDocument();

    await openCompositionModule(user, 'Melodicization');
    const moduleLane = screen.getByRole('combobox', { name: 'Melodicization module lane' });
    await user.click(moduleLane);
    await user.click(screen.getByRole('option', { name: '1' }));
    expect(screen.getByRole('combobox', { name: 'Rhythm source' })).toHaveValue(
      'Interference · Resultant'
    );
    expect(screen.getByRole('combobox', { name: 'Pitch source' })).toHaveValue(
      'Pitch List · Pitches'
    );
    expect(screen.getByText('22 notes', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
  }, 15_000);

  it('voices and transforms pitch classes non-destructively on the selected route', async () => {
    const user = userEvent.setup();
    renderPage();

    await openCompositionModule(user, 'Pitch List');
    const interpretation = screen.getByRole('combobox', { name: 'Read list as' });
    await user.click(interpretation);
    await user.click(screen.getByRole('option', { name: 'Pitch classes' }));
    const values = screen.getByRole('textbox', { name: 'Pitch values' });
    await user.clear(values);
    await user.click(values);
    await user.paste('[0 3 7]');

    await openCompositionModule(user, 'Melodicization');
    const rhythmSource = screen.getByRole('combobox', { name: 'Rhythm source' });
    await user.click(rhythmSource);
    await user.click(screen.getByRole('option', { name: 'Interference · Resultant' }));
    const pitchSource = screen.getByRole('combobox', { name: 'Pitch source' });
    await user.click(pitchSource);
    await user.click(screen.getByRole('option', { name: 'Pitch List · Pitches' }));

    expect(screen.getByText('Route · Pitch input')).toBeInTheDocument();
    expect(screen.getByText('Pitch List · Pitches → Melodicization · Pitches')).toBeInTheDocument();
    expect(screen.getByText('22 events', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
    expect(screen.getByText('66 notes', { selector: '.mantine-Badge-label' })).toBeInTheDocument();

    const transpose = screen.getByRole('textbox', { name: 'Pitch route transposition' });
    await user.clear(transpose);
    await user.type(transpose, '2');
    await user.click(screen.getByRole('button', { name: 'Show event table' }));
    expect(screen.getAllByText('[D4 F4 A4]').length).toBeGreaterThan(0);
    const modifiedPitchInlet = screen.getByRole('button', {
      name: 'Adjust pitch route: +2 st · ≥ MIDI 60',
    });
    expect(modifiedPitchInlet).toHaveTextContent(/^P$/);
    expect(modifiedPitchInlet).toHaveAttribute('data-modified', 'true');

    await openCompositionModule(user, 'Pitch List');
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toHaveValue('[0 3 7]');
    await waitFor(() =>
      expect(localStorage.getItem(compositionStateKeys.moduleRouteStates)).toContain(
        '"transposition":2'
      )
    );
  }, 15_000);

  it('offers each interference lane at the receiving rhythm input', async () => {
    const user = userEvent.setup();
    renderPage();
    await openCompositionModule(user, 'Melodicization');

    const rhythmSource = screen.getByRole('combobox', { name: 'Rhythm source' });
    await user.click(rhythmSource);
    expect(screen.getByRole('option', { name: 'Interference · Resultant' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Interference · Generator 1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Interference · Generator 2' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Interference · Generator 3' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Interference · Generator 1' }));

    expect(rhythmSource).toHaveValue('Interference · Generator 1');
  });

  it('leaves a removed connected generator visibly disconnected', async () => {
    const user = userEvent.setup();
    renderPage();
    await openCompositionModule(user, 'Melodicization');
    const rhythmSource = screen.getByRole('combobox', { name: 'Rhythm source' });
    await user.click(rhythmSource);
    await user.click(screen.getByRole('option', { name: 'Interference · Generator 3' }));

    await openCompositionModule(user, 'Interference');
    await user.click(screen.getByRole('button', { name: 'Remove Generator 3' }));
    await openCompositionModule(user, 'Melodicization');

    expect(screen.getByRole('combobox', { name: 'Rhythm source' })).toHaveValue(
      'Missing source · generator:generator-c'
    );
    expect(screen.getByText('Connected source is no longer available.')).toBeInTheDocument();
  }, 15_000);

  it('makes pitch allocation policy inspectable', async () => {
    const user = userEvent.setup();
    renderPage();
    await openCompositionModule(user, 'Melodicization');

    const rhythmSource = screen.getByRole('combobox', { name: 'Rhythm source' });
    await user.click(rhythmSource);
    await user.click(screen.getByRole('option', { name: 'Interference · Resultant' }));
    const pitchSource = screen.getByRole('combobox', { name: 'Pitch source' });
    await user.click(pitchSource);
    await user.click(screen.getByRole('option', { name: 'Pitch List · Pitches' }));

    const allocation = screen.getByRole('combobox', { name: 'Pitch allocation' });
    await user.click(allocation);
    await user.click(screen.getByRole('option', { name: 'Cycle attacks across pitches' }));
    expect(allocation).toHaveValue('Cycle attacks across pitches');
    await user.click(allocation);
    await user.click(screen.getByRole('option', { name: 'Zip and stop at the shorter input' }));
    expect(screen.getByText('17 trailing rhythm items unused by Zip.')).toBeInTheDocument();
    expect(screen.getByText('5 notes', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
  }, 15_000);

  it('restores composition state and live bindings after remounting', async () => {
    const user = userEvent.setup();
    const firstRender = renderPage();
    await openCompositionModule(user, 'Pitch List');
    await user.clear(screen.getByRole('textbox', { name: 'Pitch values' }));
    await user.type(screen.getByRole('textbox', { name: 'Pitch values' }), '60, 63, 67');
    await openCompositionModule(user, 'Melodicization');

    const rhythmSource = screen.getByRole('combobox', { name: 'Rhythm source' });
    await user.click(rhythmSource);
    await user.click(screen.getByRole('option', { name: 'Interference · Resultant' }));
    const pitchSource = screen.getByRole('combobox', { name: 'Pitch source' });
    await user.click(pitchSource);
    await user.click(screen.getByRole('option', { name: 'Pitch List · Pitches' }));
    const allocation = screen.getByRole('combobox', { name: 'Pitch allocation' });
    await user.click(allocation);
    await user.click(screen.getByRole('option', { name: 'Zip and stop at the shorter input' }));
    await setVolumeToThirty(user, 'Melodicization preview volume');
    await user.click(screen.getByRole('button', { name: 'Zoom in in time' }));
    await user.click(screen.getByRole('switch', { name: 'Follow playback' }));

    await waitFor(() => {
      expect(localStorage.getItem(compositionStateKeys.activeCompositionModule)).toBe(
        '"melodicization"'
      );
      expect(localStorage.getItem(compositionStateKeys.melodicizationVolume)).toBe('30');
      expect(localStorage.getItem(compositionStateKeys.moduleRouteStates)).toContain(
        'interference'
      );
      expect(localStorage.getItem(compositionStateKeys.melodicizationPianoRollView)).toContain(
        '"followPlayback":true'
      );
    });

    firstRender.unmount();
    const secondRender = renderPersistedPage();

    expect(screen.getByRole('heading', { name: 'Melodicization' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Rhythm source' })).toHaveValue(
      'Interference · Resultant'
    );
    expect(screen.getByRole('combobox', { name: 'Pitch source' })).toHaveValue(
      'Pitch List · Pitches'
    );
    expect(screen.getByRole('combobox', { name: 'Pitch allocation' })).toHaveValue(
      'Zip and stop at the shorter input'
    );
    expect(screen.getByRole('slider', { name: 'Melodicization preview volume' })).toHaveAttribute(
      'aria-valuenow',
      '30'
    );
    expect(screen.getByRole('switch', { name: 'Follow playback' })).toBeChecked();

    await openCompositionModule(user, 'Pitch List');
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toHaveValue('60, 63, 67');
    await user.click(screen.getByRole('button', { name: 'Reset Pitch List' }));
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toHaveValue(
      '60, 62, 64, 67, 66.5'
    );
    await waitFor(() =>
      expect(localStorage.getItem(compositionStateKeys.pitchValues)).toBe('"60, 62, 64, 67, 66.5"')
    );
    secondRender.unmount();
    renderPersistedPage();
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toHaveValue(
      '60, 62, 64, 67, 66.5'
    );
  }, 30_000);

  it('changes alignment mode and reevaluates deterministically', async () => {
    const user = userEvent.setup();
    renderPage();
    await openConstruction(user);
    const alignment = screen.getByRole('combobox', { name: 'Alignment' });
    await user.click(alignment);
    await user.click(screen.getByRole('option', { name: 'Cartesian' }));
    expect(alignment).toHaveValue('Cartesian');
    expect(
      within(moduleCard('rhythm-generator')).getByText(/patterns: rhythmPattern list/)
    ).toBeInTheDocument();
  });

  it('inspects generated pattern provenance', async () => {
    const user = userEvent.setup();
    renderPage();
    await openConstruction(user);
    expect(screen.getAllByText('Provenance').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/requestedOffset/).length).toBeGreaterThan(0);
  });

  it('displays the routed rejected frame in the combiner inspector', async () => {
    const user = userEvent.setup();
    renderPage();
    await openConstruction(user);
    await user.click(
      within(moduleCard('parameter-combiner')).getByRole('button', { name: 'Inspect' })
    );
    expect(screen.getByText(/impulses 7 exceeds length 4/)).toBeInTheDocument();
  });

  it('exports and resets the example', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    renderPage();
    await openConstruction(user);
    await user.click(screen.getByRole('button', { name: 'Export JSON' }));
    expect((screen.getByLabelText('Versioned patch JSON') as HTMLTextAreaElement).value).toContain(
      '"schemaVersion": 1'
    );
    await user.click(screen.getByRole('button', { name: 'Reset construction' }));
    expect(screen.getByText('Construction example restored.')).toBeInTheDocument();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
});
