import { describe, expect, it } from 'vitest';
import {
  DOCK_KEYS,
  dockerNumber,
  keyLabel,
  matchCommand,
  type DockCommand,
  type KeyEventLike,
} from './keyMap';

const ev = (over: Partial<KeyEventLike>): KeyEventLike => ({
  key: '',
  code: '',
  altKey: false,
  ctrlKey: false,
  shiftKey: false,
  metaKey: false,
  ...over,
});

describe('the dock key map', () => {
  it('maps F6, Shift+F6, Alt+F6 and Alt+Shift+F6 to the docker and splitter cycles', () => {
    expect(matchCommand(ev({ key: 'F6', code: 'F6' }))).toBe('nextDocker');
    expect(matchCommand(ev({ key: 'F6', code: 'F6', shiftKey: true }))).toBe('prevDocker');
    expect(matchCommand(ev({ key: 'F6', code: 'F6', altKey: true }))).toBe('nextSplitter');
    expect(matchCommand(ev({ key: 'F6', code: 'F6', altKey: true, shiftKey: true }))).toBe(
      'prevSplitter'
    );
  });

  it('matches Alt+digit by code, so a macOS Option character does not matter', () => {
    expect(matchCommand(ev({ key: 'Dead', code: 'Digit1', altKey: true }))).toBe('docker1');
    expect(matchCommand(ev({ key: '9', code: 'Digit9', altKey: true }))).toBe('docker9');
    expect(matchCommand(ev({ key: '1', code: 'Digit1' }))).toBeNull();
    expect(matchCommand(ev({ key: '1', code: 'Digit1', altKey: true, ctrlKey: true }))).toBeNull();
    expect(matchCommand(ev({ key: '0', code: 'Digit0', altKey: true }))).toBeNull();
  });

  it('maps Alt+G to Go to docker and nothing else matches', () => {
    expect(matchCommand(ev({ key: 'g', code: 'KeyG', altKey: true }))).toBe('goToDocker');
    expect(matchCommand(ev({ key: 'g', code: 'KeyG' }))).toBeNull();
    expect(matchCommand(ev({ key: 'g', code: 'KeyG', altKey: true, shiftKey: true }))).toBeNull();
  });

  it('has no two commands on the same key', () => {
    const seen = new Set<string>();
    for (const cmd of Object.keys(DOCK_KEYS) as DockCommand[]) {
      const spec = JSON.stringify(DOCK_KEYS[cmd]);
      expect(seen.has(spec)).toBe(false);
      seen.add(spec);
    }
  });

  it('labels keys for menus', () => {
    expect(keyLabel('nextDocker')).toBe('F6');
    expect(keyLabel('prevDocker')).toBe('Shift+F6');
    expect(keyLabel('docker3')).toBe('Alt+3');
    expect(keyLabel('goToDocker')).toBe('Alt+G');
    expect(keyLabel('prevSplitter')).toBe('Alt+Shift+F6');
  });

  it('reads the docker number of a dockerN command', () => {
    expect(dockerNumber('docker4')).toBe(4);
    expect(dockerNumber('nextDocker')).toBeNull();
  });
});
