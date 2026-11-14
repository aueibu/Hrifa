/** Kit demo (spike only): one inspector panel using every kit piece once. */
import { useState } from 'react';
import {
  ActionButton,
  Actions,
  KitScope,
  NumberField,
  Num,
  Panel,
  Row,
  Section,
  SegmentedField,
  SelectField,
  StripTool,
  TextField,
  Tip,
  Toggle,
} from './Kit';
import classes from './kit.module.css';

function DemoPanel() {
  const [title, setTitle] = useState('Sketch');
  const [tempo, setTempo] = useState<number | string>(96);
  const [latency, setLatency] = useState<number | string>(120);
  const [mode, setMode] = useState('Dorian');
  const [grid, setGrid] = useState('1/8');
  const [active, setActive] = useState(true);
  const [snap, setSnap] = useState(false);
  return (
    <Panel
      title="Selected note"
      tools={
        <>
          <StripTool label="Pin">P</StripTool>
          <StripTool label="Close">X</StripTool>
        </>
      }
    >
      <Section heading="Pitch" aside={<Num muted>12-EDO</Num>}>
        <Row name="Degree">
          <Num>3</Num>
        </Row>
        <Row name="Frequency">
          <Num>261.63 Hz</Num>
        </Row>
        <Row name="Tempo">
          <NumberField value={tempo} onChange={setTempo} />
        </Row>
      </Section>
      <Section heading="Timing">
        <Row name="Name" fill>
          <TextField value={title} onChange={setTitle} />
        </Row>
        <Row name="Delay (ms)">
          <NumberField wide value={latency} onChange={setLatency} />
        </Row>
        <Row name="Mode">
          <SelectField value={mode} onChange={setMode} data={['Ionian', 'Dorian', 'Aeolian']} />
        </Row>
        <Row name="Grid" fill>
          <SegmentedField value={grid} onChange={setGrid} data={['1/4', '1/8', '1/16']} />
        </Row>
        <Row name="Behaviour">
          <Toggle pressed={active} onPressedChange={setActive}>
            Active
          </Toggle>
          <Tip as="control" term="Snap" text="Notes jump to the nearest grid line while you drag.">
            <Toggle pressed={snap} onPressedChange={setSnap}>
              Snap
            </Toggle>
          </Tip>
        </Row>
      </Section>
      <Actions>
        <ActionButton>Reset</ActionButton>
        <ActionButton>Apply</ActionButton>
      </Actions>
    </Panel>
  );
}

export function KitDemo() {
  return (
    <div className={classes.demoGrid} data-standin="kit">
      <KitScope>
        <DemoPanel />
      </KitScope>
    </div>
  );
}
