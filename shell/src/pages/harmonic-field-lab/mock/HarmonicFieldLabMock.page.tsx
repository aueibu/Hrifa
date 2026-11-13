/**
 * The approved layout mock (ARC M4), kept at /harmonic-field-lab/mock until M6 retires it. It is the live page's
 * components fed a fixed state ("Harmonics 8-15" without 11/8, the 4:5:6 chord sounding), with nothing stored and nothing
 * sounding. The Retuner panel is the same placeholder in both.
 */
import { HarmonicFieldLabApp } from '../HarmonicFieldLabApp';
import { mockState } from './mockState';

export function HarmonicFieldLabMockPage() {
  return <HarmonicFieldLabApp initial={mockState()} frozen />;
}
