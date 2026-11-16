/** A new-form entry: help only in the tooltip, help + teaching in the glossary (search covers both); old form unchanged. */
import { act, fireEvent, render, screen } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderMarkup } from '../helpMarkup';
import { resetDeveloperOptionsCache, writeDeveloperOptions } from '../state/developerOptions';
import { TIPS } from '../texts';
import { GlossaryDrawer } from './GlossaryDrawer';
import { Tip } from './ui';

beforeEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
  writeDeveloperOptions({ tooltipDelay: 0 });
});
afterEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
});

const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

describe('renderMarkup', () => {
  it('renders bold, italic and a known key as elements, an unknown key as text', () => {
    const { container } = render(<p>{renderMarkup('**a** and *b* {key:holdField} {key:nope}')}</p>);
    expect(container.querySelector('strong')?.textContent).toBe('a');
    expect(container.querySelector('em')?.textContent).toBe('b');
    expect(container.querySelector('kbd')?.textContent).toBe('4');
    expect(container.textContent).toContain('{key:nope}');
  });
});

describe('new-form entries', () => {
  it('the tooltip shows the help (keys, then example) and no teaching', async () => {
    render(<Tip k="holdToPlay">Hold</Tip>);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Hold' }));
    await wait(100);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Hover and hold 1 (and 4, 5)');
    expect(tip).toHaveTextContent('Keys:');
    expect(tip).toHaveTextContent('Example:');
    expect(tip).toHaveTextContent('200, 600, 900 c');
    expect(tip).not.toHaveTextContent('shelf slot');
  });

  it('a dynamic extra sits first, under the term, before the paragraphs; the example is last', async () => {
    render(
      <Tip k="playScale" extra="DYNAMIC LINE">
        Play
      </Tip>
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Play' }));
    await wait(100);
    const text = screen.getByRole('tooltip').textContent ?? '';
    expect(text.indexOf('Play scale')).toBeLessThan(text.indexOf('DYNAMIC LINE'));
    expect(text.indexOf('DYNAMIC LINE')).toBeLessThan(text.indexOf('one after another'));
    expect(text.indexOf('one after another')).toBeLessThan(text.indexOf('Example:'));
    expect(text).not.toContain('comes back down');
  });

  it('the glossary shows help, a rule, then teaching; search finds a teaching-only word', async () => {
    render(<GlossaryDrawer opened onClose={() => undefined} />);
    const search = await screen.findByLabelText('Search the glossary');
    fireEvent.change(search, { target: { value: 'comes back down' } });
    const dialog = await screen.findByRole('dialog', { name: 'Glossary' });
    expect(dialog).toHaveTextContent('Play scale');
    expect(dialog).toHaveTextContent('lights up in every view');
    expect(dialog).toHaveTextContent('Up-down in the Sound settings');
    expect(dialog.querySelector('hr')).not.toBeNull();
  });
});

describe('old-form entries', () => {
  it('render as one plain string in the tooltip, as before', async () => {
    render(<Tip k="wave">Wave</Tip>);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Wave' }));
    await wait(100);
    expect(screen.getByRole('tooltip')).toHaveTextContent(TIPS.wave.term + TIPS.wave.text);
    expect(TIPS.wave.legacy).toBe(true);
    expect(TIPS.wave.help).toHaveLength(1);
  });
});
