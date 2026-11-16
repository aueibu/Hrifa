/**
 * Helpers for page tests that drive the preset browser and the subset rows (shared by the lab's page tests).
 * The popovers render synchronously under `fireEvent`, so these never wait on timers (they also work with fake timers);
 * they are async only so a caller can `await` them like any other step.
 */
import { fireEvent, screen, within } from '@test-utils';
import { KEY_SETTINGS } from './state/persist';

export const presetButton = () => screen.getByRole('button', { name: /^Preset:/ });

/** Open the Preset browser (when closed) and return its search box. */
export function openBrowser(): HTMLElement {
  if (!screen.queryByRole('combobox', { name: 'Search presets' })) {
    fireEvent.click(presetButton());
  }
  return screen.getByRole('combobox', { name: 'Search presets' });
}

/** Pick a preset by typing its name into the browser's search box and clicking its result row. */
export function pickPresetNow(name: string) {
  fireEvent.change(openBrowser(), { target: { value: name } });
  const row = within(screen.getByRole('listbox', { name: 'Preset search results' }))
    .getAllByRole('option')
    .find((r) => r.textContent?.startsWith(name));
  if (!row) {
    throw new Error(`No preset result starts with ${name}`);
  }
  fireEvent.click(row);
}
export async function pickPreset(name: string) {
  pickPresetNow(name);
}

export const subsetList = () => screen.getByRole('list', { name: 'Saved subsets list' });

/** Press Add, then rename the row it made (the flashing one) to `name`. */
export function addSubsetNamedNow(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Add subset' }));
  const li = subsetList().querySelector('[data-flash]');
  if (!li) {
    throw new Error('Add made no highlighted row');
  }
  fireEvent.click(within(li as HTMLElement).getByRole('button', { name: /^Rename / }));
  const box = screen.getByRole('textbox', { name: 'New name' });
  fireEvent.change(box, { target: { value: name } });
  fireEvent.keyDown(box, { key: 'Enter' });
}
export async function addSubsetNamed(name: string) {
  addSubsetNamedNow(name);
}

/** M8i: store `ui.groupShapes: false` before a render, so a 12-EDO test sees every per-root chord card as before grouping existed. */
export function ungroupShapes() {
  window.localStorage.setItem(KEY_SETTINGS, JSON.stringify({ groupShapes: false }));
}
