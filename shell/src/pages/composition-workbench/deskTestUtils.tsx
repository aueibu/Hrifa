import { act, renderHook, waitFor } from '@test-utils';
import { DeskProvider, useDesk } from './desk';
import { deskStoreIdle, loadDesk } from './deskStore';
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
  return (await loadDesk('hrifa.test.no-legacy-desk')).snippets;
}
