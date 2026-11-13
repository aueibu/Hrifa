import { shortcutMatch, type EditorTool } from './types';

const key = { ctrlKey: false, metaKey: false, altKey: false };
const tools: EditorTool[] = [
  { id: 'eraser', label: 'Eraser', shortcut: '6' },
  { id: 'chords', label: 'Chords', shortcut: '7' },
];

describe('shortcutMatch with the Chords tool', () => {
  it('maps the plain key 7 to the chords tool', () => {
    expect(shortcutMatch(tools, { key: '7', ...key })?.id).toBe('chords');
  });

  it('ignores 7 with a modifier held', () => {
    expect(shortcutMatch(tools, { key: '7', ...key, ctrlKey: true })).toBeUndefined();
    expect(shortcutMatch(tools, { key: '7', ...key, altKey: true })).toBeUndefined();
  });
});
