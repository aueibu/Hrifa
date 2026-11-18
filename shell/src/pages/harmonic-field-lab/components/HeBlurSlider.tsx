/**
 * M9 (H-39): the harmonic entropy blur slider, "s 17 c". ONE lab-wide value (`ui.heBlur`), shown in the Dissonance view's header row and
 * in the picker's Color panel while Entropy is chosen. The curve is rebuilt when the drag pauses (state/entropy.ts), not per step.
 */
import { Slider, Text } from '@mantine/core';
import { HE_BLUR_MAX, HE_BLUR_MIN } from '../../../lib/harmonic-field';
import { Tip, useLab } from './ui';
import classes from './panels.module.css';

export function HeBlurSlider() {
  const lab = useLab();
  const s = lab.state.ui.heBlur;
  return (
    <Tip k="heBlur" as="control" block>
      <div className={classes.heBlur}>
        <Text size="xs" component="span" className={classes.heBlurLabel}>
          s {s} c
        </Text>
        <Slider
          size="xs"
          className={classes.heBlurSlider}
          min={HE_BLUR_MIN}
          max={HE_BLUR_MAX}
          step={1}
          value={s}
          onChange={(v) => lab.dispatch({ type: 'ui', patch: { heBlur: v } })}
          label={null}
          thumbLabel="Harmonic entropy blur s, in cents"
          data-testid="he-blur"
        />
      </div>
    </Tip>
  );
}
