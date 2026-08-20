import { positiveModulo } from "./alignment";

/** Bjorklund pattern oriented to begin on an impulse; positive offset rotates right. */
export function euclideanRhythm(impulses: number, length: number, offset = 0): number[] {
  if (length <= 0) return [];
  if (impulses === 0) return Array(length).fill(0) as number[];
  if (impulses === length) return Array(length).fill(1) as number[];

  const counts: number[] = [];
  const remainders = [impulses];
  let divisor = length - impulses;
  let level = 0;
  while (remainders[level] > 1) {
    counts.push(Math.floor(divisor / remainders[level]));
    remainders.push(divisor % remainders[level]);
    divisor = remainders[level];
    level += 1;
  }
  counts.push(divisor);
  const built: number[] = [];
  const build = (current: number) => {
    if (current === -1) built.push(0);
    else if (current === -2) built.push(1);
    else {
      for (let index = 0; index < counts[current]; index += 1) build(current - 1);
      if (remainders[current] !== 0) build(current - 2);
    }
  };
  build(level);
  const firstImpulse = built.indexOf(1);
  const oriented = [...built.slice(firstImpulse), ...built.slice(0, firstImpulse)];
  const effective = positiveModulo(offset, length);
  if (effective === 0) return oriented;
  return [...oriented.slice(length - effective), ...oriented.slice(0, length - effective)];
}
