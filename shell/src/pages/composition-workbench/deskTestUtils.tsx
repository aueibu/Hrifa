import { act, renderHook, waitFor } from '@test-utils';
import { DeskProvider, useDesk } from './desk';
import { deskStoreIdle, loadDesk, writeDeskNow } from './deskStore';
import type { Snippet } from './snippet';

/** Renders the desk and waits for its saved copy to load (it starts in a loading state). */
export async function renderDesk() {
  const rendered = renderHook(() => useDesk(), { wrapper: DeskProvider });
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  return rendered;
}

/** Flushes the desk's pending write, then reads back what IndexedDB holds. */
export async function storedDesk(desk: ReturnType<typeof useDesk>): Promise<Snippet[]> {
  await act(async () => {
    await desk.flushDesk();
  });
  await deskStoreIdle();
  return (await loadDesk()).snippets;
}

/** Puts a desk into the (fresh, per-test) IndexedDB, as if an earlier session had saved it. */
export async function seedDesk(snippets: Snippet[]) {
  await writeDeskNow({ snippets, stored: new Map(), expectedRev: 0 });
}
