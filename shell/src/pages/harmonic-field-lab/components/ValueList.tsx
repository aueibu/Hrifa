/**
 * A list of values (`100.0, 200.0 c`, `steps 300.0, 400.0 c`, `4:5:6  7:8:9`) that wraps only BETWEEN whole values.
 * Each value (with its trailing comma) is an inline-block that never breaks; a leading `steps` stays with the first value
 * and the unit `c` stays with the last one, so a lone `c` is never left on the next line. The text content is the input
 * string unchanged (the spaces between values are kept as text). Wrapping is balanced where the browser supports
 * `text-wrap: balance` (else `pretty`, else plain greedy wrapping: the unit still sticks to its value).
 */
import classes from './panels.module.css';

/** Group the words of `text` into never-breaking runs; exported for the test. */
export function valueGroups(text: string): string[] {
  const parts = text.split(/(\s+)/);
  const groups: string[] = [];
  let glueNext = false;
  for (const part of parts) {
    if (part === '') {
      continue;
    }
    if (/^\s+$/.test(part)) {
      groups.push(part);
      continue;
    }
    const prevIdx = groups.length >= 2 ? groups.length - 2 : -1;
    if (part === 'c' && prevIdx >= 0 && !/^\s+$/.test(groups[prevIdx])) {
      groups[prevIdx] += groups[groups.length - 1] + part;
      groups.pop();
    } else if (glueNext && prevIdx >= 0) {
      groups[prevIdx] += groups[groups.length - 1] + part;
      groups.pop();
      glueNext = false;
    } else {
      groups.push(part);
    }
    glueNext = part === 'steps';
  }
  return groups;
}

export function ValueList({ text }: { text: string }) {
  return (
    <span className={classes.valueList}>
      {valueGroups(text).map((g, i) =>
        /^\s+$/.test(g) ? (
          g
        ) : (
          <span key={i} className={classes.valueItem} data-value>
            {g}
          </span>
        )
      )}
    </span>
  );
}
