import { Button } from '../../../ui';
/** The prime filter (label, All / None, one toggle chip per prime): shared by the generator's field settings and the meta ring panel. */
import { PRIME_LABELS } from '../state/generate';
import { Num, Tip } from './ui';
import classes from './lab.module.css';

export function PrimeFilterChips({
  mask,
  onToggle,
  onAll,
  label = 'Prime filter',
}: {
  mask: readonly boolean[];
  onToggle: (slot: number) => void;
  onAll: (on: boolean) => void;
  label?: string;
}) {
  return (
    <>
      <div className={classes.rowBetween}>
        <Tip k="primeFilter">{label}</Tip>
        <span className={classes.inline}>
          <Tip k="primeAll" as="control">
            <Button size="compact-xs" variant="default" onClick={() => onAll(true)}>
              All
            </Button>
          </Tip>
          <Tip k="primeNone" as="control">
            <Button size="compact-xs" variant="default" onClick={() => onAll(false)}>
              None
            </Button>
          </Tip>
        </span>
      </div>
      <div className={classes.primes} role="group" aria-label="Prime filter">
        {PRIME_LABELS.map((p, slot) => (
          <button
            key={p}
            type="button"
            className={classes.switchChip}
            data-on={mask[slot]}
            aria-pressed={mask[slot]}
            onClick={() => onToggle(slot)}
          >
            <Num>{p}</Num>
          </button>
        ))}
      </div>
    </>
  );
}
