/** Notes stand-in (throwaway): a small form-like panel with the lab's compact sizes; two columns when wide. */
import { useState } from 'react';
import { NativeSelect, NumberInput, TextInput } from '@mantine/core';
import { slotSizeAttr, type SlotSize } from '../../../lib/stage';
import classes from './standins.module.css';

export function NotesStandin({ size }: { size: SlotSize }) {
  const [title, setTitle] = useState('Sketch');
  const [tempo, setTempo] = useState<number | string>(96);
  const wide = size.width === 'wide';
  return (
    <div data-standin="notes">
      <p className={classes.sizeText}>size {slotSizeAttr(size)}</p>
      <div className={`${classes.form} ${wide ? classes.formWide : ''}`}>
        <TextInput
          size="xs"
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
        />
        <NumberInput size="xs" label="Tempo" hideControls value={tempo} onChange={setTempo} />
        <NativeSelect size="xs" label="Mode" data={['Ionian', 'Dorian', 'Aeolian']} />
      </div>
    </div>
  );
}
