/**
 * Keys panel: one big ring comparing the subset with a key (hovered, else last clicked, else the current key), its
 * summary line and the Switch / Add buttons, then one mini ring per key with its common-tone count.
 */
import { useState } from 'react';
import { Button } from '@mantine/core';
import { MAX_KEYS_NOTES, type KeyRingData } from '../state/derive';
import {
  addTo,
  commonTones,
  keyDiff,
  keySummary,
  subsetSig,
  switchTo,
  viewedKey,
  type ClickedKey,
  type KeyDiff,
} from '../state/keysModes';
import { chevronBox, layoutLabels, leaderEnds, type Box } from '../state/labelLayout';
import { RING_GAP, RingChevron } from './ModeRoot';
import { Num, Strip, Tip, useLab } from './ui';
import classes from './panels.module.css';

const BIG = 260;
const BC = BIG / 2;
const BR = 92;
/** Room round the ring for labels that move out to a further lane. */
const BPAD = 50;

/** The large comparison ring: four groups with four shapes (filled, plus, minus strike, dashed). */
function BigKeyRing({ k, diff, label }: { k: KeyRingData; diff: KeyDiff; label: string }) {
  const lab = useLab();
  const { field, repC, ratios } = lab.base;
  const at = (c: number, r = BR) => {
    const a = (c / repC) * 2 * Math.PI - Math.PI / 2;
    return { x: BC + r * Math.cos(a), y: BC + r * Math.sin(a) };
  };
  const common = new Set(diff.common);
  const added = new Set(diff.added);
  const dropped = new Set(diff.dropped);
  // label places: the key root first (it must clear its chevron); none overlap another or the chevron
  const order = field
    .map((_, i) => i)
    .sort((a, b) => (a === k.rootIdx ? -1 : b === k.rootIdx ? 1 : a - b));
  const dots = field.map((n) => at(n.c));
  const rootDot = dots[k.rootIdx];
  const obstacles: Box[] = rootDot ? [chevronBox(BC, BC, rootDot.x, rootDot.y, RING_GAP)] : [];
  const placed = layoutLabels(
    order.map((i) => ({ ...at(field[i].c, BR + 30), text: ratios[i] })),
    {
      cx: BC,
      cy: BC,
      laneStep: 22,
      lanes: 3,
      advance: 6.6,
      subAdvance: 5.4,
      lineH: 12,
      subH: 10,
      subDy: 10,
      pad: 5.5,
      obstacles,
      bounds: { x0: -BPAD, y0: -BPAD, x1: BIG + BPAD, y1: BIG + BPAD },
    }
  );
  const places = new Map(order.map((i, j) => [i, placed[j]]));
  return (
    <svg
      viewBox={`${-BPAD} ${-BPAD} ${BIG + 2 * BPAD} ${BIG + 2 * BPAD}`}
      className={classes.bigKeySvg}
      role="group"
      aria-label={label}
      data-testid="big-key-ring"
    >
      <circle className={classes.bigKeyCircle} cx={BC} cy={BC} r={BR} />
      {field.map((n, i) => {
        const p = at(n.c);
        const kind = common.has(i)
          ? 'common'
          : added.has(i)
            ? 'added'
            : dropped.has(i)
              ? 'dropped'
              : 'plain';
        const sounding = lab.sounding.has(i);
        // the key's root is the mode root this key would give
        const isRoot = i === k.rootIdx;
        const label = places.get(i)!;
        return (
          <g
            key={i}
            data-note={i}
            data-kind={kind}
            data-root={isRoot ? 'true' : undefined}
            role={isRoot ? 'group' : undefined}
            aria-label={isRoot ? `${ratios[i]}, mode root` : undefined}
            data-sounding={sounding ? 'true' : undefined}
            onMouseEnter={() => lab.setHover(i)}
            onMouseLeave={() => lab.setHover(null)}
            onClick={(e) => {
              if (e.altKey) {
                lab.setPin(lab.pin === i ? null : i);
              }
            }}
          >
            {lab.pin === i && <circle className={classes.pinRing} cx={p.x} cy={p.y} r={14} />}
            {lab.hover === i && <circle className={classes.selRing} cx={p.x} cy={p.y} r={14} />}
            {sounding && <circle className={classes.bigKeyLit} cx={p.x} cy={p.y} r={11} />}
            {lab.chord.has(i) && <circle className={classes.bigKeyChord} cx={p.x} cy={p.y} r={9} />}
            {isRoot && <RingChevron cx={BC} cy={BC} x={p.x} y={p.y} />}
            {kind === 'plain' && <circle className={classes.bigKeyPlain} cx={p.x} cy={p.y} r={3} />}
            {kind === 'common' && (
              <circle className={classes.bigKeyCommon} cx={p.x} cy={p.y} r={6} />
            )}
            {kind === 'added' && (
              <>
                <circle className={classes.bigKeyAdded} cx={p.x} cy={p.y} r={6.5} />
                <path
                  className={classes.bigKeyGlyph}
                  d={`M${p.x - 3} ${p.y}h6M${p.x} ${p.y - 3}v6`}
                />
              </>
            )}
            {kind === 'dropped' && (
              <>
                <circle className={classes.bigKeyDropped} cx={p.x} cy={p.y} r={6.5} />
                <path className={classes.bigKeyStrike} d={`M${p.x - 9} ${p.y}h18`} />
              </>
            )}
            {label.leader && (
              <line
                className={classes.bigKeyLeader}
                data-testid="label-leader"
                {...leaderEnds(p.x, p.y, label.x, label.y)}
              />
            )}
            <text
              className={classes.svgLabel}
              style={label.scale < 1 ? { fontSize: 11 * label.scale } : undefined}
              data-on={kind !== 'plain'}
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {ratios[i]}
            </text>
          </g>
        );
      })}
      {k.moved.map((m, d) => {
        if (m.found) {
          return null;
        }
        const p = at(m.c);
        return (
          <circle
            key={`miss${d}`}
            className={classes.bigKeyMissing}
            data-kind="missing"
            cx={p.x}
            cy={p.y}
            r={6.5}
          />
        );
      })}
    </svg>
  );
}

interface ActEvent {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

function KeyRing({
  k,
  subset,
  viewed,
  current,
  onHover,
  onAct,
}: {
  k: KeyRingData;
  subset: readonly number[];
  viewed: boolean;
  current: boolean;
  onHover: (root: number | null) => void;
  onAct: (k: KeyRingData, e: ActEvent) => void;
}) {
  const lab = useLab();
  const { field, repC } = lab.base;
  const S = 56;
  const C = S / 2;
  const R = 20;
  const at = (c: number, r = R) => {
    const a = (c / repC) * 2 * Math.PI - Math.PI / 2;
    return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
  };
  const x = commonTones(subset, k.idx);
  const label = k.complete
    ? `Key on ${k.root}: the whole scale fits`
    : `Key on ${k.root}: ${k.missing} scale note${k.missing === 1 ? '' : 's'} missing from the field`;
  return (
    <li>
      <button
        type="button"
        className={classes.keyRing}
        data-complete={k.complete}
        data-viewed={viewed}
        data-current={current}
        aria-label={`${label}; ${x} of ${subset.length} notes in common with the subset`}
        title={`${label}. ${x} of the subset's ${subset.length} notes are common to this key. Click: switch to this key. Shift+click: add its notes to the subset. Ctrl-click (Cmd on a Mac): hear it as a scale.`}
        onMouseEnter={() => onHover(k.rootIdx)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(k.rootIdx)}
        onBlur={() => onHover(null)}
        onClick={(e) => onAct(k, e)}
      >
        <svg viewBox={`0 0 ${S} ${S}`} className={classes.keySvg} role="img" aria-label={label}>
          <circle className={classes.keyCircle} cx={C} cy={C} r={R} />
          {field.map((n, i) => {
            const p = at(n.c);
            return <circle key={i} className={classes.keyField} cx={p.x} cy={p.y} r={2} />;
          })}
          {k.moved.map((m, d) => {
            const p = at(m.c, R + 0.5);
            return m.found ? (
              <circle key={d} className={classes.keyFound} cx={p.x} cy={p.y} r={3.2} />
            ) : (
              <path
                key={d}
                className={classes.keyMiss}
                d={`M${p.x - 2.6} ${p.y - 2.6}l5.2 5.2M${p.x + 2.6} ${p.y - 2.6}l-5.2 5.2`}
              />
            );
          })}
        </svg>
        <Num>{k.root}</Num>
        <Num muted>{k.complete ? 'fits' : `−${k.missing}`}</Num>
        <Tip k="commonTones" as="control">
          <span data-testid="common-tones">
            <Num muted>{`${x}|${subset.length}`}</Num>
          </span>
        </Tip>
      </button>
    </li>
  );
}

export function KeysPanel() {
  const lab = useLab();
  const { an, base } = lab;
  const [clicked, setClicked] = useState<ClickedKey | null>(null);
  const [hoverKey, setHoverKey] = useState<number | null>(null);
  if (!an.keys) {
    if (hoverKey !== null) {
      setHoverKey(null);
    }
    return (
      <>
        <Strip title={<Tip k="keysModes">Keys</Tip>} />
        <div className={classes.panelBody}>
          <span className={classes.hint} role="status">
            {base.rel.length === 0
              ? 'Select notes to see their keys.'
              : `Keys are worked out for subsets of up to ${MAX_KEYS_NOTES} notes in a field this size. Select fewer notes.`}
          </span>
        </div>
      </>
    );
  }
  const { keyRings, completeKeys } = an.keys;
  const field = base.field;
  const tabIndex = lab.state.active;
  const fieldKey = `${field.length}:${Math.round(field.reduce((a, n) => a + n.c, 0) * 100)}`;
  const sig = subsetSig(tabIndex, fieldKey, base.idx, base.mode);
  // a click is forgotten as soon as the subset changes any other way, so it cannot come back later
  if (clicked && clicked.sig !== sig) {
    setClicked(null);
  }
  if (hoverKey !== null && !keyRings.some((r) => r.rootIdx === hoverKey)) {
    setHoverKey(null);
  }
  const currentRoot = base.idx[base.mode];
  const root = viewedKey(hoverKey, clicked, sig, currentRoot);
  const k =
    keyRings.find((r) => r.rootIdx === root) ?? keyRings.find((r) => r.rootIdx === currentRoot);
  const diff = k ? keyDiff(base.idx, k.idx) : null;
  const source =
    hoverKey !== null && k?.rootIdx === hoverKey
      ? 'pointed at'
      : clicked && clicked.sig === sig && k?.rootIdx === clicked.root
        ? 'last clicked'
        : 'current key';
  const doSwitch = (r: KeyRingData) => {
    const next = switchTo(r.idx, r.rootIdx);
    setClicked({ root: r.rootIdx, sig: subsetSig(tabIndex, fieldKey, next.idx, next.mode) });
    lab.dispatch({ type: 'sel/set', idx: next.idx, mode: next.mode });
  };
  const doAdd = (r: KeyRingData) => {
    const next = addTo(base.idx, base.mode, r.idx);
    setClicked({ root: r.rootIdx, sig: subsetSig(tabIndex, fieldKey, next.idx, next.mode) });
    lab.dispatch({ type: 'sel/join', idx: next.idx });
  };
  const onAct = (r: KeyRingData, e: ActEvent) => {
    if (e.altKey) {
      // Alt+click pins the key's root note, as Alt+click pins a note in every other view
      lab.setPin(lab.pin === r.rootIdx ? null : r.rootIdx);
    } else if (e.ctrlKey || e.metaKey) {
      setClicked({ root: r.rootIdx, sig });
      lab.audio.playFieldScale(switchTo(r.idx, r.rootIdx).idx);
    } else if (e.shiftKey) {
      doAdd(r);
    } else {
      doSwitch(r);
    }
  };
  const viewLabel =
    k && diff
      ? `Key on ${base.ratios[k.rootIdx]} against the subset: ${keySummary(diff)}`
      : 'Key comparison';
  return (
    <>
      <Strip title={<Tip k="keysModes">Keys</Tip>} />
      <div className={`${classes.panelBody} ${classes.keysBody}`} data-testid="keys-body">
        {k && diff && (
          <section className={classes.bigKey} aria-label="Key comparison">
            <h3 className={classes.familyHead}>
              <Tip k="keyView">Key comparison</Tip>
              <Num muted>
                key on {base.ratios[k.rootIdx]} ({source})
              </Num>
            </h3>
            <BigKeyRing k={k} diff={diff} label={viewLabel} />
            <p className={classes.bigKeySummary} data-testid="key-summary" role="status">
              {keySummary(diff)}
            </p>
            <span className={classes.legend} aria-label="Marks">
              <Tip k="keyMarks">
                <span className={classes.legendItem}>
                  <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
                    <circle className={classes.bigKeyCommon} cx="7" cy="7" r="4.5" />
                  </svg>
                  common
                </span>{' '}
                <span className={classes.legendItem}>
                  <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
                    <circle className={classes.bigKeyAdded} cx="7" cy="7" r="5" />
                    <path className={classes.bigKeyGlyph} d="M4 7h6M7 4v6" />
                  </svg>
                  +added
                </span>{' '}
                <span className={classes.legendItem}>
                  <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
                    <circle className={classes.bigKeyDropped} cx="7" cy="7" r="5" />
                    <path className={classes.bigKeyStrike} d="M1 7h12" />
                  </svg>
                  &minus;dropped
                </span>{' '}
                <span className={classes.legendItem}>
                  <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
                    <circle className={classes.bigKeyMissing} cx="7" cy="7" r="5" />
                  </svg>
                  missing
                </span>
              </Tip>
            </span>
            <div className={classes.keyActions} role="group" aria-label="Key actions">
              <Tip k="keySwitch" as="control">
                <Button
                  size="compact-xs"
                  variant="default"
                  disabled={diff.added.length === 0 && diff.dropped.length === 0}
                  onClick={() => doSwitch(k)}
                >
                  Switch to key
                </Button>
              </Tip>
              <Tip k="keyAdd" as="control">
                <Button
                  size="compact-xs"
                  variant="default"
                  disabled={diff.added.length === 0}
                  onClick={() => doAdd(k)}
                >
                  Add key
                </Button>
              </Tip>
            </div>
          </section>
        )}
        <h3 className={classes.familyHead}>
          <Tip k="keyRings">Key rings</Tip>
          <Num muted>
            {completeKeys.length} of {field.length} complete
          </Num>
        </h3>
        <ul
          className={`${classes.keyRings} ${classes.keyRingsScroll}`}
          aria-label="Keys"
          data-testid="key-rings-scroll"
        >
          {keyRings.map((r) => (
            <KeyRing
              key={r.rootIdx}
              k={r}
              subset={base.idx}
              viewed={k?.rootIdx === r.rootIdx}
              current={r.rootIdx === currentRoot}
              onHover={setHoverKey}
              onAct={onAct}
            />
          ))}
        </ul>
      </div>
    </>
  );
}
