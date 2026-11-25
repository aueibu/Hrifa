import { fireEvent, render, screen, userEvent, waitFor, within } from '@test-utils';
import {
  compositionInstanceStateKey,
  compositionStateKeys,
} from './composition-workbench/usePersistentState';
import { CompositionWorkbenchPage } from './CompositionWorkbench.page';

// The three default instances keep their state under suffixed keys like every other instance.
const pitchListKey = (base: string) => compositionInstanceStateKey(base, 'pitch-list');
const melodicizationKey = (base: string) => compositionInstanceStateKey(base, 'melodicization');

function clearWorkbenchState() {
  const bases = new Set<string>(Object.values(compositionStateKeys));
  Object.keys(localStorage)
    .filter((key) => bases.has(key.split('.instance.')[0]))
    .forEach((key) => localStorage.removeItem(key));
}

function renderPage() {
  clearWorkbenchState();
  return render(<CompositionWorkbenchPage />);
}

function renderPersistedPage() {
  return render(<CompositionWorkbenchPage />);
}

async function openCompositionNode(
  user: ReturnType<typeof userEvent.setup>,
  name: 'Interference' | 'Pitch List' | 'Melodicization'
) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
}

async function addCompositionNode(
  user: ReturnType<typeof userEvent.setup>,
  name: 'Pitch List' | 'Melodicization'
) {
  await user.click(screen.getByRole('button', { name: 'Add node' }));
  await user.click(await screen.findByRole('menuitem', { name }));
}

async function chooseSource(
  user: ReturnType<typeof userEvent.setup>,
  name: 'Rhythm source' | 'Pitch source',
  label: string
) {
  await user.click(screen.getByRole('button', { name }));
  // A node with one compatible output is a single item ("Pitch List · Pitches"); a node with
  // several opens a submenu: the node first, then its output.
  const direct = screen.queryByRole('menuitem', { name: label });
  if (direct) {
    await user.click(direct);
    return;
  }
  const [nodeName, output] = label.split(' · ');
  await user.click(await screen.findByRole('menuitem', { name: nodeName }));
  await user.click(await screen.findByRole('menuitem', { name: output }));
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
  it('opens in the node-first composition view', () => {
    renderPage();
    // Exactly these tabs and no other (a node must not get one): the Canvas, Nodes, Data-block editor and Inspector
    // docker tabs and the Canvas, Desk and Edit workspace tabs in the header.
    expect(
      screen
        .getAllByRole('tab')
        .map((tab) => tab.textContent)
        .sort()
    ).toEqual(['Canvas', 'Canvas', 'Data-block editor', 'Desk', 'Edit', 'Inspector', 'Nodes']);
    expect(screen.getByRole('heading', { name: 'Interference' })).toBeInTheDocument();
  });

  it('generates the default three-generator interference resultant', () => {
    renderPage();
    expect(
      screen.getByLabelText('Resultant durations 2 1 1 1 1 2 1 1 2 2 1 1 2 2 1 1 2 1 1 1 1 2')
    ).toBeInTheDocument();
    expect(screen.getAllByText('LCM 30').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Preview/ })).toBeEnabled();
  });

  it('offers a grouping click alongside the transport metronome', async () => {
    const user = userEvent.setup();
    renderPage();
    const groupingClick = screen.getByRole('switch', { name: /Click the grouping/ });
    const metronome = screen.getByRole('button', { name: 'Metronome' });
    expect(groupingClick).not.toBeChecked();
    expect(metronome).toHaveAttribute('aria-pressed', 'false');
    await user.click(groupingClick);
    await user.click(metronome);
    expect(groupingClick).toBeChecked();
    expect(metronome).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Tempo' })).toHaveValue('120 BPM');
  });

  it('supports adding another authored generator list', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '+ Generator' }));
    expect(screen.getByRole('textbox', { name: 'Generator 4 pattern' })).toHaveValue('6');
    expect(screen.getByRole('button', { name: 'Remove Generator 4' })).toBeEnabled();
  });

  it('uses the node tree canvas as the composition navigator', async () => {
    const user = userEvent.setup();
    renderPage();
    const grid = screen.getByLabelText('Composition canvas');
    expect(grid.querySelectorAll('[data-node-slot="true"]')).toHaveLength(3);
    expect(within(grid).queryByRole('button', { name: /Note events/ })).not.toBeInTheDocument();
    expect(within(grid).getByRole('button', { name: /^Melodicization/ })).toHaveTextContent(
      'Notes | 0'
    );
    // Placement is stored as free canvas coordinates.
    expect(localStorage.getItem(compositionStateKeys.compositionInstances)).toContain(
      '"nodeId":"melodicization","x":100,"y":170'
    );
    await openCompositionNode(user, 'Pitch List');
    expect(screen.getByRole('heading', { name: 'Pitch List', level: 2 })).toBeInTheDocument();
    await openCompositionNode(user, 'Melodicization');
    expect(screen.getByRole('heading', { name: 'Melodicization', level: 2 })).toBeInTheDocument();
    await openCompositionNode(user, 'Interference');
    expect(screen.getByRole('heading', { name: 'Interference', level: 2 })).toBeInTheDocument();
  }, 15_000);

  it('removes nodes and adds them back from the canvas', async () => {
    const user = userEvent.setup();
    renderPage();
    const grid = screen.getByLabelText('Composition canvas');

    await openCompositionNode(user, 'Pitch List');
    await user.click(screen.getByRole('button', { name: 'Remove Pitch List' }));
    expect(within(grid).queryByRole('button', { name: /^Pitch List/ })).not.toBeInTheDocument();

    await addCompositionNode(user, 'Pitch List');
    expect(within(grid).getByRole('button', { name: /^Pitch List/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pitch List', level: 2 })).toBeInTheDocument();
    await waitFor(() => {
      expect(localStorage.getItem(compositionStateKeys.compositionInstances)).toMatch(
        /"nodeId":"pitch-list","x":\d+,"y":\d+/
      );
    });
  }, 15_000);

  it('Ctrl-click builds a multi-selection without changing the inspected node', async () => {
    const user = userEvent.setup();
    renderPage();
    const grid = screen.getByLabelText('Composition canvas');
    const slot = (name: RegExp) =>
      within(grid).getByRole('button', { name }).closest('.react-flow__node') as HTMLElement;

    await openCompositionNode(user, 'Interference');
    await user.keyboard('{Control>}');
    await user.click(within(grid).getByRole('button', { name: /^Pitch List/ }));
    await user.click(within(grid).getByRole('button', { name: /^Melodicization/ }));
    await user.keyboard('{/Control}');

    expect(slot(/^Pitch List/)).toHaveClass('selected');
    expect(slot(/^Melodicization/)).toHaveClass('selected');
    // Modifier clicks only select; the node editor stays on Interference.
    expect(screen.getByRole('heading', { name: 'Interference', level: 2 })).toBeInTheDocument();
  }, 15_000);

  it('keeps a node’s setup controls in the inspector, and reachable when it is hidden', async () => {
    const user = userEvent.setup();
    renderPage();
    const inspector = screen
      .getByRole('button', { name: /^Node$/ })
      .closest('[class*="_part_"]') as HTMLElement;

    // Setup (preview volume) lives in the inspector's Node part; shaping stays in the panel.
    expect(
      within(inspector).getByRole('slider', { name: 'Interference preview volume' })
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Generator 1 pattern' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide inspector' }));
    // With the inspector hidden the same controls fall back into the node panel.
    expect(screen.getByRole('slider', { name: 'Interference preview volume' })).toBeInTheDocument();
  }, 15_000);

  it('places any number of independently authored node instances', async () => {
    const user = userEvent.setup();
    renderPage();
    const grid = screen.getByLabelText('Composition canvas');

    await addCompositionNode(user, 'Pitch List');
    await addCompositionNode(user, 'Pitch List');

    expect(within(grid).getAllByRole('button', { name: /^Pitch List/ })).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Pitch List 3', level: 2 })).toBeInTheDocument();
    const values = screen.getByRole('textbox', { name: 'Pitch values' });
    await user.clear(values);
    await user.type(values, '72, 75');

    await user.click(within(grid).getByRole('button', { name: /^Pitch List 2/ }));
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toHaveValue(
      '60, 62, 64, 67, 66.5'
    );
    // Each new node lands in its own free slot rather than on top of another.
    const stored = JSON.parse(localStorage.getItem(compositionStateKeys.compositionInstances)!) as {
      nodeId: string;
      x: number;
      y: number;
    }[];
    const pitchLists = stored.filter((instance) => instance.nodeId === 'pitch-list');
    expect(pitchLists).toHaveLength(3);
    expect(new Set(pitchLists.map((instance) => `${instance.x},${instance.y}`)).size).toBe(3);
  }, 20_000);

  it('keeps duplicate Melodicization receiver bindings independent', async () => {
    const user = userEvent.setup();
    renderPage();
    const grid = screen.getByLabelText('Composition canvas');

    await addCompositionNode(user, 'Melodicization');
    expect(screen.getByRole('heading', { name: 'Melodicization 2', level: 2 })).toBeInTheDocument();

    await chooseSource(user, 'Pitch source', 'Pitch List · Pitches');
    expect(screen.getByRole('button', { name: 'Pitch source' })).toHaveTextContent(
      'Pitch List · Pitches'
    );

    await user.click(within(grid).getByRole('button', { name: /^Melodicization 1/ }));
    expect(screen.getByRole('button', { name: 'Pitch source' })).toHaveTextContent(
      'Connect pitch or pitch-class material'
    );
    await chooseSource(user, 'Pitch source', 'Pitch List · Pitches');
    expect(
      within(grid).getByRole('button', { name: 'Inspect outlet Pitch List · Pitches' })
    ).toHaveAttribute('title', expect.stringContaining('2 downstream uses'));
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
    expect(screen.getByRole('button', { name: 'Pitch source' })).toHaveTextContent(
      'Pitch List · Pitches'
    );
  }, 20_000);

  it('keeps a removed source visibly missing at its receiver', async () => {
    const user = userEvent.setup();
    renderPage();

    await openCompositionNode(user, 'Melodicization');
    await chooseSource(user, 'Pitch source', 'Pitch List · Pitches');

    await openCompositionNode(user, 'Pitch List');
    await user.click(screen.getByRole('button', { name: 'Remove Pitch List' }));
    await openCompositionNode(user, 'Melodicization');

    expect(screen.getByRole('button', { name: 'Pitch source' })).toHaveTextContent(
      'Missing source · pitches'
    );
    expect(screen.getByText('Connected source is no longer available.')).toBeInTheDocument();
  }, 15_000);

  it('opens Pitch List with explicit input interpretations', async () => {
    const user = userEvent.setup();
    renderPage();
    await openCompositionNode(user, 'Pitch List');
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
    expect(
      screen.getByRole('img', { name: 'Pitch list C4 | [C4 E4 G4] | D4' })
    ).toBeInTheDocument();
    await setVolumeToThirty(user, 'Pitch preview volume');
  });

  it('populates one provenance-aware pitch-class group from the Forte catalog', async () => {
    const user = userEvent.setup();
    renderPage();
    await openCompositionNode(user, 'Pitch List');
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
      expect(
        localStorage.getItem(pitchListKey(compositionStateKeys.pitchCatalogOrigins))
      ).toContain('"forteNumber":"3-11"')
    );
  }, 15_000);

  it('routes rhythm and pitch outputs into Melodicization', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole('button', { name: 'Use in…' })).not.toBeInTheDocument();
    await openCompositionNode(user, 'Melodicization');
    expect(screen.getByRole('heading', { name: 'Melodicization' })).toBeInTheDocument();
    await chooseSource(user, 'Rhythm source', 'Interference · Resultant');
    await chooseSource(user, 'Pitch source', 'Pitch List · Pitches');

    await setVolumeToThirty(user, 'Melodicization preview volume');

    expect(screen.getByText('22 notes', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
    expect(screen.getByText(/events \| note \| cyclic/)).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Melodicization piano roll; 22 notes, 0 selected' })
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
    expect(screen.getByText('1.1.1.00')).toBeInTheDocument();

    // Rearranging the canvas never rewires the node tree.
    await user.click(screen.getByRole('button', { name: 'Tidy' }));
    await waitFor(() =>
      expect(localStorage.getItem(compositionStateKeys.compositionInstances)).toContain(
        '"nodeId":"melodicization","x":100,"y":'
      )
    );
    expect(localStorage.getItem(compositionStateKeys.compositionInstances)).not.toContain(
      '"nodeId":"melodicization","x":100,"y":170'
    );
    await openCompositionNode(user, 'Melodicization');
    expect(screen.getByRole('button', { name: 'Rhythm source' })).toHaveTextContent(
      'Interference · Resultant'
    );
    expect(screen.getByRole('button', { name: 'Pitch source' })).toHaveTextContent(
      'Pitch List · Pitches'
    );
    expect(screen.getByText('22 notes', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
  }, 15_000);

  it('voices and transforms pitch classes non-destructively on the selected route', async () => {
    const user = userEvent.setup();
    renderPage();

    await openCompositionNode(user, 'Pitch List');
    const interpretation = screen.getByRole('combobox', { name: 'Read list as' });
    await user.click(interpretation);
    await user.click(screen.getByRole('option', { name: 'Pitch classes' }));
    const values = screen.getByRole('textbox', { name: 'Pitch values' });
    await user.clear(values);
    await user.click(values);
    await user.paste('[0 3 7]');

    await openCompositionNode(user, 'Melodicization');
    await chooseSource(user, 'Rhythm source', 'Interference · Resultant');
    await chooseSource(user, 'Pitch source', 'Pitch List · Pitches');

    expect(screen.getByText('Route · Pitch input')).toBeInTheDocument();
    expect(screen.getByText('Pitch List · Pitches → Melodicization · Pitches')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Voice pitch class as concrete pitch' }));
    expect(screen.getByText('22 events', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
    expect(screen.getByText('66 notes', { selector: '.mantine-Badge-label' })).toBeInTheDocument();

    const transpose = screen.getByRole('textbox', { name: 'Pitch route transposition' });
    await user.clear(transpose);
    await user.type(transpose, '2');
    expect(screen.getAllByText('[D4 F4 A4]').length).toBeGreaterThan(0);
    const modifiedPitchInlet = screen.getByRole('button', {
      name: 'Adjust pitch route: +2 st · ≥ MIDI 60',
    });
    expect(modifiedPitchInlet).toHaveTextContent(/^P$/);
    expect(modifiedPitchInlet).toHaveAttribute('data-modified', 'true');

    await openCompositionNode(user, 'Pitch List');
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toHaveValue('[0 3 7]');
    await waitFor(() =>
      expect(localStorage.getItem(compositionStateKeys.nodeRouteStates)).toContain(
        '"transposition":2'
      )
    );
  }, 15_000);

  it('offers each interference lane under its node at the receiving rhythm input', async () => {
    const user = userEvent.setup();
    renderPage();
    await openCompositionNode(user, 'Melodicization');

    const rhythmSource = screen.getByRole('button', { name: 'Rhythm source' });
    await user.click(rhythmSource);
    // Nodes come first; a node with several outputs opens to them, like a track's channels.
    await user.click(await screen.findByRole('menuitem', { name: 'Interference' }));
    expect(await screen.findByRole('menuitem', { name: 'Resultant' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Generator 1' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Generator 2' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Generator 3' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Generator 1' }));

    expect(rhythmSource).toHaveTextContent('Interference · Generator 1');
  });

  it('leaves a removed connected generator visibly disconnected', async () => {
    const user = userEvent.setup();
    renderPage();
    await openCompositionNode(user, 'Melodicization');
    await chooseSource(user, 'Rhythm source', 'Interference · Generator 3');

    await openCompositionNode(user, 'Interference');
    await user.click(screen.getByRole('button', { name: 'Remove Generator 3' }));
    await openCompositionNode(user, 'Melodicization');

    expect(screen.getByRole('button', { name: 'Rhythm source' })).toHaveTextContent(
      'Missing source · generator:generator-c'
    );
    expect(screen.getByText('Connected source is no longer available.')).toBeInTheDocument();
  }, 15_000);

  it('makes pitch allocation policy inspectable', async () => {
    const user = userEvent.setup();
    renderPage();
    await openCompositionNode(user, 'Melodicization');

    await chooseSource(user, 'Rhythm source', 'Interference · Resultant');
    await chooseSource(user, 'Pitch source', 'Pitch List · Pitches');

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
    await openCompositionNode(user, 'Pitch List');
    await user.clear(screen.getByRole('textbox', { name: 'Pitch values' }));
    await user.type(screen.getByRole('textbox', { name: 'Pitch values' }), '60, 63, 67');
    await openCompositionNode(user, 'Melodicization');

    await chooseSource(user, 'Rhythm source', 'Interference · Resultant');
    await chooseSource(user, 'Pitch source', 'Pitch List · Pitches');
    const allocation = screen.getByRole('combobox', { name: 'Pitch allocation' });
    await user.click(allocation);
    await user.click(screen.getByRole('option', { name: 'Zip and stop at the shorter input' }));
    await setVolumeToThirty(user, 'Melodicization preview volume');
    await user.click(screen.getByRole('button', { name: 'Zoom in in time' }));
    await user.click(screen.getByRole('switch', { name: 'Follow playback' }));

    await waitFor(() => {
      expect(localStorage.getItem(compositionStateKeys.activeCompositionNode)).toBe(
        '"melodicization"'
      );
      expect(
        localStorage.getItem(melodicizationKey(compositionStateKeys.melodicizationVolume))
      ).toBe('30');
      expect(localStorage.getItem(compositionStateKeys.nodeRouteStates)).toContain('interference');
      expect(
        localStorage.getItem(melodicizationKey(compositionStateKeys.melodicizationPianoRollView))
      ).toContain('"followPlayback":true');
    });

    firstRender.unmount();
    const secondRender = renderPersistedPage();

    expect(screen.getByRole('heading', { name: 'Melodicization' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rhythm source' })).toHaveTextContent(
      'Interference · Resultant'
    );
    expect(screen.getByRole('button', { name: 'Pitch source' })).toHaveTextContent(
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

    await openCompositionNode(user, 'Pitch List');
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toHaveValue('60, 63, 67');
    await user.click(screen.getByRole('button', { name: 'Reset Pitch List' }));
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toHaveValue(
      '60, 62, 64, 67, 66.5'
    );
    await waitFor(() =>
      expect(localStorage.getItem(pitchListKey(compositionStateKeys.pitchValues))).toBe(
        '"60, 62, 64, 67, 66.5"'
      )
    );
    secondRender.unmount();
    renderPersistedPage();
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toHaveValue(
      '60, 62, 64, 67, 66.5'
    );
  }, 30_000);

  it('refits the piano roll each time Melodicization is opened', async () => {
    const user = userEvent.setup();
    clearWorkbenchState();
    const framedView = JSON.stringify({
      pixelsPerQuarter: 40,
      pixelsPerSemitone: 16,
      scrollLeft: 120,
      scrollTop: 300,
      followPlayback: false,
      framed: true,
    });
    localStorage.setItem(
      melodicizationKey(compositionStateKeys.melodicizationPianoRollView),
      framedView
    );
    const view = () =>
      JSON.parse(
        localStorage.getItem(melodicizationKey(compositionStateKeys.melodicizationPianoRollView)) ??
          '{}'
      );
    // Stored before mount: rendering the page with another node open keeps the framing.
    renderPersistedPage();
    expect(view().framed).toBe(true);
    await openCompositionNode(user, 'Melodicization');
    await waitFor(() => expect(view().framed).toBe(false));
    expect(view().pixelsPerQuarter).toBe(40);
  });

  it('offers the same nodes, including a blank Data-block node, in the Add node and right-click menus', async () => {
    const user = userEvent.setup();
    renderPage();
    const names = () => screen.getAllByRole('menuitem').map((item) => item.textContent);
    await user.click(screen.getByRole('button', { name: 'Add node' }));
    await screen.findByRole('menuitem', { name: 'Pitch List' });
    const fromButton = names();
    expect(fromButton).toContain('Data-block');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryAllByRole('menuitem')).toHaveLength(0));
    const pane = document.querySelector('.react-flow__pane');
    expect(pane).not.toBeNull();
    fireEvent.contextMenu(pane as Element, { clientX: 300, clientY: 200 });
    await screen.findByText('Add node here');
    await screen.findByRole('menuitem', { name: 'Pitch List' });
    expect(names()).toEqual(fromButton);
  });

  it('inserts a node from the canvas right-click menu', async () => {
    const user = userEvent.setup();
    renderPage();
    const count = () => screen.queryAllByRole('button', { name: /^Pitch List/ }).length;
    const before = count();
    const pane = document.querySelector('.react-flow__pane');
    expect(pane).not.toBeNull();
    fireEvent.contextMenu(pane as Element, { clientX: 300, clientY: 200 });
    expect(await screen.findByText('Add node here')).toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: 'Pitch List' }));
    await waitFor(() => expect(count()).toBe(before + 1));
  });
});
