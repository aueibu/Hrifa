/** Validation of a docker (or workspace) name typed in a prompt: not empty, not taken (case-insensitive). */
export function validateName(
  name: string,
  taken: readonly string[],
  noun = 'docker'
): string | null {
  const n = name.trim();
  if (n === '') {
    return `Enter a name for the ${noun}.`;
  }
  if (taken.some((t) => t.trim().toLowerCase() === n.toLowerCase())) {
    return `A ${noun} named "${n}" already exists.`;
  }
  return null;
}
