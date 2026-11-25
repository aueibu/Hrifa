/**
 * The reverb part of the Sound settings popover (A1, H-31): preset, Mix, Load impulse and Remove custom impulse. The setting
 * (`ui.reverb`) is in the lab state; the loaded impulse (its name and length, a note when it was lost) is the shared
 * runtime store `audio/impulseStore.ts`; loading and removing go through the audio hook (`useLab().audio`). Without Web Audio
 * every control here is disabled and says so; the rest of the popover (Wave, Volume ...) stays usable.
 */
import { useRef, useState } from 'react';
import { Slider, Text } from '@mantine/core';
import { NativeSelect, Button } from '../../../ui';
import { useImpulseState } from '../audio/impulseStore';
import { DEFAULT_WET_MIX, REVERB_PRESETS, customLabel, type ReverbPreset } from '../audio/reverb';
import { Tip, useLab } from './ui';
import classes from './lab.module.css';

const PRESET_LABEL: Record<ReverbPreset, string> = {
  dry: 'Dry',
  room: 'Room',
  hall: 'Hall',
  custom: 'Custom',
};

/** Accepted file types for the picker (the browser decides what it can decode: WAV, AIFF, MP3 and OGG are the ones named). */
const ACCEPT = 'audio/*,.wav,.aif,.aiff,.mp3,.ogg';

export function ReverbControls() {
  const { state, dispatch, audio } = useLab();
  const { reverb } = state.ui;
  const imp = useImpulseState();
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const off = !audio.audioAvailable;
  // Custom with no impulse plays as Hall (the engine does the same), so that is what the select shows
  const shown: ReverbPreset = reverb.preset === 'custom' && !imp.data ? 'hall' : reverb.preset;

  const choose = (value: string) => {
    const preset = REVERB_PRESETS.find((p) => p === value) ?? 'dry';
    // leaving Dry with a mix of 0 would change nothing you can hear: start at the default mix
    const mix =
      shown === 'dry' && preset !== 'dry' && reverb.mix === 0 ? DEFAULT_WET_MIX : reverb.mix;
    dispatch({ type: 'ui', patch: { reverb: { preset, mix } } });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setError(null);
    const reason = await audio.loadImpulse(file);
    setError(reason);
  };

  return (
    <>
      <Tip k="reverb" as="control" block>
        <NativeSelect
          size="xs"
          label="Reverb"
          disabled={off}
          data={REVERB_PRESETS.map((p) => ({
            value: p,
            label: p === 'custom' && imp.data ? customLabel(imp.data) : PRESET_LABEL[p],
            disabled: p === 'custom' && !imp.data,
          }))}
          value={shown}
          onChange={(e) => choose(e.currentTarget.value)}
        />
      </Tip>
      <Tip k="reverbMix" as="control" block>
        <Text size="xs">Mix</Text>
        <Slider
          size="xs"
          value={Math.round(reverb.mix * 100)}
          onChange={(v) => dispatch({ type: 'ui', patch: { reverb: { ...reverb, mix: v / 100 } } })}
          label={null}
          thumbLabel="Reverb mix"
          disabled={off || shown === 'dry'}
        />
      </Tip>
      <Tip k="reverbImpulse" as="control" block>
        <div className={classes.formStack}>
          <input
            ref={picker}
            type="file"
            accept={ACCEPT}
            aria-label="Impulse file"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              // the same file can be picked again
              e.currentTarget.value = '';
              void onFile(file);
            }}
          />
          <Button
            size="compact-xs"
            variant="default"
            disabled={off}
            loading={imp.busy}
            onClick={() => picker.current?.click()}
          >
            Load impulse
          </Button>
          <Button
            size="compact-xs"
            variant="default"
            disabled={off || !imp.data}
            onClick={() => {
              setError(null);
              void audio.removeImpulse();
            }}
          >
            Remove custom impulse
          </Button>
        </div>
      </Tip>
      {off && (
        <div className={classes.fieldMsg} role="status">
          Audio is not available in this browser.
        </div>
      )}
      {error && (
        <div className={classes.fieldMsg} data-kind="err" role="alert">
          {error}
        </div>
      )}
      {imp.note && (
        <div className={classes.fieldMsg} data-kind="warn" role="status">
          {imp.note}
        </div>
      )}
    </>
  );
}
