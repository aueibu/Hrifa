import { describe, expect, it } from 'vitest';
import { validateName } from './dockerName';

describe('validateName', () => {
  it('accepts a free name', () => {
    expect(validateName('Side', ['Main', 'Tools'])).toBeNull();
    expect(validateName('  Side  ', ['Main'])).toBeNull();
  });

  it('refuses an empty name', () => {
    expect(validateName('', [])).toBe('Enter a name for the docker.');
    expect(validateName('   ', ['Main'], 'screenset')).toBe('Enter a name for the screenset.');
  });

  it('refuses a taken name, ignoring case and spaces', () => {
    expect(validateName(' tools ', ['Main', 'Tools'])).toBe(
      'A docker named "tools" already exists.'
    );
  });
});
