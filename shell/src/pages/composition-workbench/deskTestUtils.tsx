import { act, renderHook, waitFor } from '@test-utils';
import type { PacketBlock } from './dataBlock';
import { isPacketBlock, type StoredDataBlock } from './dataBlocks/registry';
import { DeskProvider, useDesk } from './desk';
import { deskStoreIdle, loadDesk, writeDeskNow } from './deskStore';

/** Renders the desk and waits for its saved copy to load (it starts in a loading state). */
export async function renderDesk() {
  const rendered = renderHook(() => useDesk(), { wrapper: DeskProvider });
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  return rendered;
}

/** Flushes the desk's pending write, then reads back every block IndexedDB holds (packets and records). */
export async function storedAllBlocks(
  desk: ReturnType<typeof useDesk>
): Promise<StoredDataBlock[]> {
  await act(async () => {
    await desk.flushDesk();
  });
  await deskStoreIdle();
  return (await loadDesk()).dataBlocks;
}

/** `storedAllBlocks`, packet blocks only (what the packet tests read). */
export async function storedDesk(desk: ReturnType<typeof useDesk>): Promise<PacketBlock[]> {
  return (await storedAllBlocks(desk)).filter(isPacketBlock);
}

/** Puts a desk into the (fresh, per-test) IndexedDB, as if an earlier session had saved it. */
export async function seedDesk(dataBlocks: StoredDataBlock[]) {
  await writeDeskNow({ dataBlocks, stored: new Map(), expectedRev: 0 });
}
