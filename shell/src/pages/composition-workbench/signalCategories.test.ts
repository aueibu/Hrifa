import { describe, expect, it } from 'vitest';
import { packet } from './model';
import {
  categoryOfInlet,
  categoryOfModule,
  categoryOfPacket,
  signalCategoryColor,
  signalCategoryHue,
} from './signalCategories';

describe('signal categories', () => {
  it('colors follow the Bitwig-style mapping', () => {
    expect(signalCategoryHue).toEqual({
      rhythm: 'yellow',
      pitch: 'orange',
      events: 'green',
      audio: 'red',
      numeric: null,
    });
    expect(signalCategoryColor('numeric')).toBe('var(--text-muted)');
    expect(signalCategoryColor('rhythm')).toBe('var(--mark-yellow)');
  });

  it('classifies packets by what they carry', () => {
    expect(categoryOfPacket(packet('list', 'duration', []))).toBe('rhythm');
    expect(categoryOfPacket(packet('list', 'pitch', []))).toBe('pitch');
    expect(categoryOfPacket(packet('list', 'pitchClass', []))).toBe('pitch');
    expect(categoryOfPacket(packet('events', 'note', []))).toBe('events');
    expect(categoryOfPacket(packet('list', 'integer', []))).toBe('numeric');
    expect(categoryOfPacket(undefined)).toBe('numeric');
  });

  it('gives every module a fixed category and every inlet an expected one', () => {
    expect(categoryOfModule('interference')).toBe('rhythm');
    expect(categoryOfModule('pitch-list')).toBe('pitch');
    expect(categoryOfModule('melodicization')).toBe('events');
    expect(categoryOfModule('mixer')).toBe('audio');
    expect(categoryOfModule('arithmetic')).toBe('numeric');
    expect(categoryOfInlet('melodicization', 'rhythm')).toBe('rhythm');
    expect(categoryOfInlet('melodicization', 'pitches')).toBe('pitch');
    expect(categoryOfInlet('mixer', 'channel-1')).toBe('audio');
    expect(categoryOfInlet('arithmetic', 'a')).toBe('numeric');
  });
});
