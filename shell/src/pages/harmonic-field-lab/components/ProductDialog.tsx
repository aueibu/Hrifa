/**
 * Subset product (M8g): the Product... button on the subset row and its dialog. Sources (this subset or a saved one, each note
 * switchable) carry the Shape (this subset or a saved one), Up | Down | Both, Steps 1 to 4, and a merge tolerance. A live line
 * counts the products; the ones not yet in the field show as ghost marks on the main ring while the dialog is open. The Add menu
 * offers Open in new tab (`product/tab`), Create as composite (the Send-to-composite popup) and Replace current field
 * (`product/replace`). The rules are pure
 * (`lib/harmonic-field/subsetProduct.ts`).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { Menu } from '@mantine/core';
import {
  PRODUCT_MAX_STEPS,
  RELATIVE_MAX_NOTES,
  addProductNotes,
  productTexts,
  productTooMany,
  subsetProduct,
  type Note,
  type ProductDirection,
  type ProductKind,
} from '../../../lib/harmonic-field';
import { Button, NativeSelect, ScrubNumber, SegmentedControl, ActionIcon } from '../../../ui';
import { useLabDeveloperOptions } from '../state/developerOptions';
import { ownerLabel } from '../state/generatorLibrary';
import { MAX_TABS } from '../state/labState';
import { sendModeOf } from '../state/sendMode';
import { openSendPopup, useSendView, type SendItem } from '../state/sendStore';
import { ChangeTicks, type TickSpec } from './ChangeTicks';
import { CloseIcon } from './icons';
import { ChordDrawing, DRAWING_DOT_R, DRAWING_R } from './ShelfPanel';
import { Num, Strip, Tip, useLab } from './ui';
import labClasses from './lab.module.css';
import panelClasses from './panels.module.css';
import classes from './productPanel.module.css';

const THIS = 'this';
/** Drawing units to on-screen px for the 13.5rem product rings (2 units across at 16 px/rem). */
const PX = 108;
const u = (px: number): number => px / PX;
/**
 * The result marks follow the composite family (human, 2026-11-18: "lets unify those too"): CompositeRing's marks in its
 * 64-unit box (common r 4, added/dropped r 4.5, plus arms 2.2) at the Composites panel card size (72 px across, so 1.125 px a
 * unit), scaled 1.5x like the product dots. Strokes stay at the card's width (productPanel.module.css).
 */
const COMP_PX = 72 / 64;
const MARK_K = 1.5;
const mark = (compUnits: number): number => u(compUnits * COMP_PX * MARK_K);

/**
 * The product's result as marks on a ring like the other two (no polygon): a grey filled dot ON the ring line for a pitch already
 * in the field, and a change tick (`ChangeTicks`, M8m: a short radial tick) for a new one (green, outward) or a merged one (blue, crossing the
 * ring line with a bar across its inner end). Radii and strokes are in px, drawn with non-scaling strokes. The svg is
 * `overflow: visible`, so an outward tick may stand past the viewBox.
 */
function ResultRing({
  pitches,
  kinds,
  repC,
}: {
  pitches: readonly { c: number }[];
  kinds: readonly ProductKind[];
  repC: number;
}) {
  const R = repC > 0 ? repC : 1200;
  const angleOf = (c: number): number => (2 * Math.PI * (((c % R) + R) % R)) / R;
  return (
    <svg
      className={classes.ring}
      viewBox="-1 -1 2 2"
      role="group"
      aria-label="Product result"
      data-testid="product-result-ring"
    >
      <circle className={panelClasses.drawingRing} r={DRAWING_R} />
      {pitches.map((n, i) => {
        if ((kinds[i] ?? 'new') !== 'original') {
          return null;
        }
        const a = angleOf(n.c);
        return (
          <circle
            key={i}
            className={classes.resultOriginal}
            data-kind="original"
            cx={Math.sin(a) * DRAWING_R}
            cy={-Math.cos(a) * DRAWING_R}
            r={mark(4)}
          />
        );
      })}
      <ChangeTicks
        R={DRAWING_R}
        k={u(1)}
        ticks={pitches.flatMap((n, i): TickSpec[] => {
          const kind = kinds[i] ?? 'new';
          return kind === 'original'
            ? []
            : [{ angle: angleOf(n.c), kind: kind === 'merged' ? 'merged' : 'added' }];
        })}
      />
    </svg>
  );
}

/** An operator between two columns: invisible copies of the caption and picker rows keep the glyph level with the rings. */
function Operator({ glyph }: { glyph: string }) {
  return (
    <div className={classes.op} aria-hidden>
      <span className={`${labClasses.pickHead} ${classes.opGhost}`}>&nbsp;</span>
      <div className={classes.opPicker} />
      <div className={classes.opRing}>{glyph}</div>
    </div>
  );
}
/** The product rings' dot radius in drawing units: 1.5x the card dot on screen (DRAWING_DOT_R x 1.5 x 4.5rem / 13.5rem; human, M8g look 10). */
const PRODUCT_DOT_R = (DRAWING_DOT_R * 1.5 * 4.5) / 13.5;

/** Whether the product panel is open: the Workspace owns it (the panel is its own grid area), the subset row's button toggles it. Not stored. */
export const ProductOpenContext = createContext<{ open: boolean; setOpen: (o: boolean) => void }>({
  open: false,
  setOpen: () => {},
});
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "9 products, 6 distinct, 3 already in field". */
export function productLine(total: number, distinct: number, inField: number): string {
  return `${plural(total, 'product', 'products')}, ${distinct} distinct, ${inField} already in field`;
}

/** The Product... button on the subset row: opens (or closes) the product module under the tools row. */
export function ProductButton() {
  const { tab } = useLab();
  const { open, setOpen } = useContext(ProductOpenContext);
  return (
    <Tip k="subsetProduct" as="control">
      <Button
        size="compact-xs"
        variant={open ? 'filled' : 'default'}
        aria-expanded={open}
        disabled={tab.sel.length === 0 && !open}
        onClick={() => setOpen(!open)}
      >
        Product...
      </Button>
    </Tip>
  );
}

/**
 * The product module: its own workspace grid area, as wide as the tuner strip, under the tools row (so the Nearest scale box
 * and the stats never move). It looks like the strip and saved-list modules (a `Strip` header over an inset body). Every
 * setting starts fresh each time it opens; the page stays usable around it.
 */
export function ProductPanel({ onClose }: { onClose: () => void }) {
  const { state, tab, dispatch } = useLab();
  const [dev] = useLabDeveloperOptions();
  const [sourceId, setSourceId] = useState(THIS);
  const [shapeId, setShapeId] = useState(THIS);
  const [off, setOff] = useState<ReadonlySet<number>>(() => new Set());
  const [direction, setDirection] = useState<ProductDirection>('up');
  const [steps, setSteps] = useState(1);
  // runtime only; starts at the Developer merge tolerance each time the panel unfolds
  const [tol, setTol] = useState(dev.mergeTolerance);

  const here = useMemo(
    () => tab.sel.map((i) => tab.field[i]).filter(Boolean),
    [tab.sel, tab.field]
  );
  const saved = state.library.subsets;
  const savedGroups = useMemo(() => {
    const byOwner = new Map<string, { value: string; label: string }[]>();
    for (const s of saved) {
      const list = byOwner.get(s.owner) ?? [];
      list.push({ value: `s:${s.id}`, label: s.name });
      byOwner.set(s.owner, list);
    }
    return [...byOwner].map(([owner, items]) => ({
      group: ownerLabel(state.library, owner),
      items,
    }));
  }, [saved, state.library]);
  const options = useMemo(
    () => [{ value: THIS, label: 'This subset' }, ...savedGroups],
    [savedGroups]
  );
  const pitchesOf = (id: string): Note[] => {
    if (id === THIS) {
      return here;
    }
    return saved.find((s) => `s:${s.id}` === id)?.pitches ?? here;
  };
  const sourceAll = useMemo(
    () => pitchesOf(sourceId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceId, here, saved]
  );
  const shape = useMemo(
    () => pitchesOf(shapeId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shapeId, here, saved]
  );
  const sources = useMemo(() => sourceAll.filter((_, i) => !off.has(i)), [sourceAll, off]);

  const result = useMemo(
    () => subsetProduct({ sources, shape, direction, steps, rep: tab.rep, field: tab.field, tol }),
    [sources, shape, direction, steps, tab.rep, tab.field, tol]
  );

  // the notes a Relative field made from the product would hold (1/1 always stays), to refuse past the limit (Q7)
  const count = useMemo(() => {
    if (!result) {
      return 0;
    }
    if (result.distinct.length > RELATIVE_MAX_NOTES) {
      return result.distinct.length + 1;
    }
    return addProductNotes(['1/1'], productTexts(result.distinct), tab.rep).length;
  }, [result, tab.rep]);
  const tooMany = count > RELATIVE_MAX_NOTES;
  const noTab = state.tabs.length >= MAX_TABS;
  const noTabReason = `There are already ${MAX_TABS} tabs; close one first.`;

  // the ghost preview on the main ring while the panel is unfolded
  const ghostKey = result && !result.overflow ? result.fresh.map((n) => n.c).join(',') : '';
  useEffect(() => {
    dispatch({
      type: 'product/preview',
      cents: ghostKey ? ghostKey.split(',').map(Number) : null,
    });
    return () => dispatch({ type: 'product/preview', cents: null });
  }, [ghostKey, dispatch]);

  const toggle = (i: number) =>
    setOff((p) => {
      const n = new Set(p);
      if (!n.delete(i)) {
        n.add(i);
      }
      return n;
    });
  const texts = () => (result ? productTexts(result.distinct) : []);
  const inNewTab = () => {
    dispatch({ type: 'product/tab', pitches: texts() });
    onClose();
  };
  const replaceField = () => {
    dispatch({ type: 'product/replace', pitches: texts() });
    onClose();
  };
  // Create as composite: the same popup the - key opens, carrying the product as one subset item (as a Keys row sends its subset).
  // The panel stays open while the popup is up and closes once a send changes the composites; Esc or a click away leaves it open.
  const sendView = useSendView();
  const pending = useRef<{ comps: unknown; seen: boolean } | null>(null);
  useEffect(() => {
    const p = pending.current;
    if (!p) {
      return;
    }
    if (sendView.popup) {
      p.seen = true;
    } else if (p.seen) {
      pending.current = null;
      if (p.comps !== state.composites) {
        onClose();
      }
    }
  }, [sendView.popup, state.composites, onClose]);
  const asComposite = (e: MouseEvent<HTMLElement>) => {
    if (!result || result.distinct.length === 0) {
      return;
    }
    const pitches = result.distinct.map((n) => ({ m: n.m ? { ...n.m } : null, c: n.c }));
    const item: SendItem = {
      kind: 'subset',
      label: 'Subset product',
      pitches,
      rep: { m: tab.rep.m ? { ...tab.rep.m } : null, c: tab.rep.c },
      root: pitches[0],
    };
    pending.current = { comps: state.composites, seen: false };
    const r = e.currentTarget.getBoundingClientRect();
    openSendPopup(item, { x: r.left, y: r.bottom }, sendModeOf(state.shelf.sketch));
  };

  const blocker = !result
    ? null
    : result.overflow
      ? 'Too many products to work out: lower Steps or leave notes out.'
      : result.total === 0
        ? 'Pick at least one source note and a shape.'
        : tooMany
          ? productTooMany(count)
          : null;
  const canAdd = !!result && !result.overflow && result.distinct.length > 0 && blocker === null;
  const repC = tab.rep.c;

  return (
    <section className={classes.panel} aria-label="Subset product" data-testid="product-panel">
      <Strip title={<Tip k="subsetProduct">Subset product</Tip>}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Close the product panel"
          onClick={onClose}
        >
          <CloseIcon />
        </ActionIcon>
      </Strip>
      <div className={classes.body}>
        <div className={classes.col} role="group" aria-label="Sources">
          <span className={labClasses.pickHead}>
            <Tip k="productSources">Sources</Tip>
            <Num muted>
              {sources.length} of {sourceAll.length}
            </Num>
          </span>
          <NativeSelect
            size="xs"
            aria-label="Sources from"
            data={options}
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.currentTarget.value);
              setOff(new Set());
            }}
          />
          <ChordDrawing
            className={classes.ring}
            dotR={PRODUCT_DOT_R}
            cents={sourceAll.map((n) => n.c)}
            repC={repC}
            off={off}
            onToggle={toggle}
          />
          <div className={labClasses.joinRow} role="group" aria-label="Source note actions">
            <Tip k="selectAll" as="control">
              <Button size="compact-xs" variant="default" onClick={() => setOff(new Set())}>
                All
              </Button>
            </Tip>
            <Tip k="selectNone" as="control">
              <Button
                size="compact-xs"
                variant="default"
                onClick={() => setOff(new Set(sourceAll.map((_, i) => i)))}
              >
                None
              </Button>
            </Tip>
            <Tip k="selectInvert" as="control">
              <Button
                size="compact-xs"
                variant="default"
                onClick={() =>
                  setOff(new Set(sourceAll.map((_, i) => i).filter((i) => !off.has(i))))
                }
              >
                Invert
              </Button>
            </Tip>
          </div>
        </div>
        <Operator glyph="×" />
        <div className={classes.col} role="group" aria-label="Shape">
          <span className={labClasses.pickHead}>
            <Tip k="productShape">Shape</Tip>
            <Num muted>{shape.length} notes</Num>
          </span>
          <NativeSelect
            size="xs"
            aria-label="Shape from"
            data={options}
            value={shapeId}
            onChange={(e) => setShapeId(e.currentTarget.value)}
          />
          <ChordDrawing
            className={classes.ring}
            dotR={PRODUCT_DOT_R}
            cents={shape.map((n) => n.c)}
            repC={repC}
          />
        </div>
        <Operator glyph="=" />
        <div className={classes.col} role="group" aria-label="Result">
          <span className={labClasses.pickHead}>
            <Tip k="productResult">Result</Tip>
            <Num muted>{result?.distinct.length ?? 0} notes</Num>
          </span>
          <div className={classes.opPicker} aria-hidden />
          <ResultRing
            pitches={result && !result.overflow ? result.distinct : []}
            kinds={result?.kinds ?? []}
            repC={repC}
          />
        </div>
        <div className={classes.controls}>
          <div className={classes.field}>
            <span className={labClasses.pickHead}>Direction</span>
            <Tip k="productDirection" as="control">
              <SegmentedControl
                size="xs"
                aria-label="Direction"
                data={[
                  { value: 'up', label: 'Up' },
                  { value: 'down', label: 'Down' },
                  { value: 'both', label: 'Both' },
                ]}
                value={direction}
                onChange={(v) => setDirection(v as ProductDirection)}
              />
            </Tip>
          </div>
          <div className={classes.field}>
            <Tip k="productSteps" as="control">
              <span className={labClasses.modeStep}>
                <ActionIcon
                  variant="default"
                  size="sm"
                  aria-label="Fewer steps"
                  disabled={steps <= 1}
                  onClick={() => setSteps((n) => Math.max(1, n - 1))}
                >
                  &lsaquo;
                </ActionIcon>
                <span className={labClasses.modeLabel}>
                  steps <Num>{steps}</Num>
                </span>
                <ActionIcon
                  variant="default"
                  size="sm"
                  aria-label="More steps"
                  disabled={steps >= PRODUCT_MAX_STEPS}
                  onClick={() => setSteps((n) => Math.min(PRODUCT_MAX_STEPS, n + 1))}
                >
                  &rsaquo;
                </ActionIcon>
              </span>
            </Tip>
          </div>
          <div className={classes.field}>
            <span className={labClasses.pickHead}>Merge within</span>
            <Tip k="productMerge" as="control">
              <ScrubNumber
                aria-label="Merge within"
                suffix=" c"
                range={[0, 50]}
                style={{ width: '6rem' }}
                value={tol}
                onChange={setTol}
              />
            </Tip>
          </div>
          <div className={classes.addRow}>
            <Tip k="productAdd" as="control">
              <span>
                <Menu position="bottom-start" withinPortal>
                  <Menu.Target>
                    <Button size="compact-xs" variant="default" disabled={!canAdd} aria-label="Add">
                      Add ›
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown aria-label="Add menu">
                    <Menu.Item
                      disabled={noTab}
                      title={noTab ? noTabReason : undefined}
                      onClick={inNewTab}
                    >
                      Open in new tab
                    </Menu.Item>
                    <Menu.Item onClick={asComposite} closeMenuOnClick>
                      Create as composite
                    </Menu.Item>
                    <Menu.Item onClick={replaceField}>Replace current field</Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </span>
            </Tip>
            <span className={classes.line} role="status">
              {result && !result.overflow
                ? productLine(result.total, result.distinct.length, result.inField)
                : ''}
            </span>
          </div>
          <span
            className={`${labClasses.fieldMsg} ${classes.msg}`}
            data-kind={blocker ? 'err' : undefined}
            role={blocker ? 'alert' : undefined}
          >
            {blocker ?? ''}
          </span>
        </div>
      </div>
    </section>
  );
}
