/** Generator section: preset + repeat, prime filter, and the method options (tabs). */
import { useMemo } from 'react';
import {
  Button,
  Checkbox,
  Group,
  NativeSelect,
  NumberInput,
  Slider,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { PRESETS, PRIMES } from '../../../lib/harmonic-field';
import { Article } from './Article';
import { field, presetInfo, repText } from './mockData';
import { Cluster, Num, Row, SectionHead, Tip } from './ui';
import classes from './mock.module.css';

const PRIME_LABELS = [...PRIMES.slice(0, 24).map(String), '97+'];

function presetOptions() {
  const groups = new Map<string, string[]>();
  for (const p of PRESETS) {
    groups.set(p.group, [...(groups.get(p.group) ?? []), p.name]);
  }
  return [...groups].map(([group, items]) => ({ group, items }));
}

function SourceBody() {
  const data = useMemo(presetOptions, []);
  return (
    <div className={classes.stack}>
      <Tip k="preset" as="control" block>
        <NativeSelect
          label={<Tip k="preset">Preset</Tip>}
          size="xs"
          data={data}
          defaultValue={presetInfo.name}
        />
      </Tip>
      <Text size="sm" className={classes.note}>
        {presetInfo.info}
      </Text>
      <Tip k="repeat" as="control" block>
        <TextInput
          label={<Tip k="repeat">Repeat interval</Tip>}
          size="xs"
          defaultValue={repText}
          description="Ratio 3/2, whole number 3, cents 701.96c, or EDO steps 7&#92;12."
        />
      </Tip>
      <Cluster title="Result">
        <Row name={<Tip k="field">Field</Tip>}>
          <Num>{field.length}</Num> notes, <Num>0</Num> filtered out
        </Row>
        <Row name="Repeat">
          <Num>{repText}</Num> (<Num>1200.00 c</Num>)
        </Row>
      </Cluster>
    </div>
  );
}

function PrimesBody() {
  return (
    <div className={classes.stack}>
      <Group gap="xs">
        <Tip k="primeAll" as="control">
          <Button size="compact-xs" variant="default">
            All
          </Button>
        </Tip>
        <Tip k="primeNone" as="control">
          <Button size="compact-xs" variant="default">
            None
          </Button>
        </Tip>
        <Text size="xs" c="dimmed">
          Applies to ratio notes only.
        </Text>
      </Group>
      <div className={classes.primes} role="group" aria-label="Prime filter">
        {PRIME_LABELS.map((p) => (
          <button
            key={p}
            type="button"
            className={classes.switchChip}
            data-on="true"
            aria-pressed="true"
          >
            <Num>{p}</Num>
          </button>
        ))}
      </div>
      <Text size="sm" c="dimmed">
        All 25 primes are on, so no note is filtered. Switch 11 and 13 off to leave a 7-limit field.
      </Text>
    </div>
  );
}

function AxisRow({ n, g, count, ctr }: { n: number; g: string; count: number; ctr: number }) {
  return (
    <div className={classes.axisRow}>
      {n === 1 ? (
        <Text size="sm" className={classes.axisName}>
          Main axis
        </Text>
      ) : (
        <Checkbox size="xs" defaultChecked label={`Axis ${n}`} className={classes.axisName} />
      )}
      <TextInput size="xs" aria-label={`Axis ${n} generator`} defaultValue={g} />
      <NumberInput
        size="xs"
        aria-label={`Axis ${n} count`}
        defaultValue={count}
        min={1}
        hideControls
      />
      <NumberInput
        size="xs"
        aria-label={`Axis ${n} centre`}
        defaultValue={ctr}
        min={0}
        hideControls
      />
    </div>
  );
}

function MethodBody() {
  return (
    <Tabs defaultValue="harmonic" keepMounted={false}>
      <Tip k="method" as="control" block>
        <Tabs.List aria-label="Method">
          <Tabs.Tab value="harmonic">Harmonic series</Tabs.Tab>
          <Tabs.Tab value="sub">Subharmonic</Tabs.Tab>
          <Tabs.Tab value="edo">Equal division</Tabs.Tab>
          <Tabs.Tab value="lattice">Lattice</Tabs.Tab>
          <Tabs.Tab value="cps">CPS</Tabs.Tab>
          <Tabs.Tab value="custom">Custom / Scala</Tabs.Tab>
        </Tabs.List>
      </Tip>
      <Tabs.Panel value="harmonic" pt="md">
        <div className={classes.methodGrid}>
          <Cluster title="Segment">
            <Tip k="startHarmonic" as="control" block>
              <Text size="sm" mb={4}>
                <Tip k="startHarmonic">Starting harmonic</Tip> <Num>8</Num>
              </Text>
              <Slider min={1} max={256} defaultValue={8} aria-label="Starting harmonic" />
            </Tip>
          </Cluster>
          <Cluster title="Reads as">
            <Row name="Runs from">
              <Num>8/8</Num> to <Num>15/8</Num>
            </Row>
            <Row name="Notes">
              <Num>8</Num> (one repeat)
            </Row>
          </Cluster>
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="sub" pt="md">
        <Text size="sm" c="dimmed">
          The same controls as Harmonic series, reading the series downward (undertones).
        </Text>
      </Tabs.Panel>
      <Tabs.Panel value="edo" pt="md">
        <Cluster title="Equal division">
          <Tip k="edoDivisions" as="control" block>
            <NumberInput
              size="xs"
              label={<Tip k="edoDivisions">Divisions</Tip>}
              defaultValue={19}
              w={140}
            />
          </Tip>
        </Cluster>
      </Tabs.Panel>
      <Tabs.Panel value="lattice" pt="md">
        <div className={classes.methodGrid}>
          <Cluster title="Shape">
            <Tip k="latticeShape" as="control" block>
              <NativeSelect
                size="xs"
                label={<Tip k="latticeShape">Lattice shape</Tip>}
                data={['Box (count x count x ...)', 'Diamond (within N steps)']}
              />
            </Tip>
          </Cluster>
          <Cluster title="Axes (generator, count, centre)">
            <Tip k="genAxis" as="control" block>
              <AxisRow n={1} g="3/2" count={12} ctr={0} />
              <AxisRow n={2} g="5/4" count={3} ctr={1} />
              <AxisRow n={3} g="7/4" count={3} ctr={1} />
            </Tip>
            <Text size="xs" c="dimmed">
              <Tip k="mos">MOS sizes</Tip> for 3/2: <Num>5</Num> <Num>7</Num> <Num>12</Num>
            </Text>
          </Cluster>
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="cps" pt="md">
        <div className={classes.methodGrid}>
          <Cluster title="Factors">
            <Tip k="cpsFactors" as="control" block>
              <TextInput
                size="xs"
                label={<Tip k="cpsFactors">Factors</Tip>}
                defaultValue="1 3 5 7"
              />
            </Tip>
          </Cluster>
          <Cluster title="Choose">
            <Tip k="cpsK" as="control" block>
              <NumberInput
                size="xs"
                label={<Tip k="cpsK">Choose k</Tip>}
                defaultValue={2}
                w={120}
              />
            </Tip>
            <Text size="xs" c="dimmed">
              1 3 5 7 choose 2 is the hexany.
            </Text>
          </Cluster>
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="custom" pt="md">
        <div className={classes.methodGrid}>
          <Cluster title="Intervals">
            <Tip k="customIntervals" as="control" block>
              <Textarea
                size="xs"
                rows={5}
                label={<Tip k="customIntervals">Intervals (one per line)</Tip>}
                defaultValue={'9/8\n5/4\n4/3\n3/2\n5/3\n15/8'}
              />
            </Tip>
          </Cluster>
          <Cluster title="Import">
            <Tip k="loadScl" as="control" block>
              <Button size="xs" variant="default">
                Load .scl file
              </Button>
            </Tip>
          </Cluster>
        </div>
      </Tabs.Panel>
    </Tabs>
  );
}

export function GeneratorSection() {
  return (
    <section id="sec-generator" className={classes.section} aria-labelledby="sec-generator-h">
      <SectionHead
        id="sec-generator-h"
        title="Generator"
        lede="Where the field of notes comes from."
      />
      <div className={classes.grid}>
        <Article
          id="blk-source"
          title="Preset & method"
          tip="preset"
          lede={
            <>
              {presetInfo.name}: one octave of the overtone series, <Num>{field.length}</Num> notes.
            </>
          }
        >
          <SourceBody />
        </Article>
        <Article
          id="blk-primes"
          title="Prime filter"
          tip="primeFilter"
          lede="No prime is filtered out, so every ratio note is kept."
        >
          <PrimesBody />
        </Article>
        <Article
          id="blk-method"
          title="Method options"
          tip="method"
          span={2}
          lede="Harmonic series from 8; the other five methods are one tab away."
        >
          <MethodBody />
        </Article>
      </div>
    </section>
  );
}
