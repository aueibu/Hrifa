# Sortable: the shell's drag layer (H-36)

One layer on dnd-kit (`core`, `sortable`, `utilities`) for reordering lists and grids and, later, for dropping payloads onto targets across panels.
**Pages import only from `src/components/Sortable`, never from `@dnd-kit/*`.** Time and space drags (PianoRoll, Stage splitter and dock) keep their own pointer code.

## The rule (`reorder.ts`, pure, tested in `reorder.test.ts`)

Live rearrange: while a card is dragged, the other cards slide into the new order; the order on screen is what the drop produces. A copy of the card follows the pointer (`DragOverlay`, the same card rendering); the card's own slot stays as an empty dimmed placeholder that travels through the grid to where it will land.

**Pause on a card to swap.** The pointer resting `SWAP_DWELL_MS` (800 ms) on one card (other than the dragged one) turns it into a swap target: the others snap back to the original order, the target is outlined, and the preview shows the trade (the target sits in the dragged card's original slot, the placeholder where the target was). Moving off the target in any direction (onto another card, into a gap, off the list) resumes live rearranging; coming back onto it restarts the clock.

Example, 19/14, 26/19, 19/13, 27/17, 44/27, dragging 19/14 to 44/27:

| Pointer | Drop gives |
| --- | --- |
| crosses quickly, drops on 44/27 | 26/19 19/13 27/17 44/27 19/14 (insert) |
| rests about 0.5 s on 44/27, drops | 44/27 26/19 19/13 27/17 19/14 (swap) |

Pure pieces: `trackOver` (a new card restarts the clock), `dwellMode` (`insert` or `swap` plus the target), `previewOrder`, `moveFor`. The provider owns the timer. Off every card (a gap, outside) the last card stays the target; off a drop target it no longer takes the drop.

## Preview rendering

`Sortable` owns a dnd-kit `SortableContext` with its own strategy: live mode calls dnd-kit's `rectSortingStrategy` (grid) or `verticalListSortingStrategy` (list) with the pointer's card as the over index, translation only (no scale). Swap mode returns a transform only for the dragged slot and the target, which trade rects; every other slot gets none. Transforms go on the slot; dnd-kit measures slots without transforms, so the hit rects stay put.

Mixed sizes: the strategies move each card to the slot rect of its new neighbor, assuming equal sizes. A card that spans 2 columns therefore lands approximately (top-left of the rect it takes) while dragging; after the drop the grid reflows from the new order. For exact preview of mixed rows, render the cards in the previewed order instead of using transforms.

## API

```tsx
<Sortable id="pins" items={ids} layout="grid" onMove={({ from, to, kind }) => ...} onActiveChange={setBusy}>
  {ids.map((id) => (
    <SortableItem key={id} id={id}>
      {(handle) => <button {...handle}>{id}</button>}
    </SortableItem>
  ))}
</Sortable>
```

- `onMove`: `insert`: `to` is the FINAL index of the moved item (`arrayMove`'s meaning; `movePin(list, from, to)` takes it); `swap`: `to` is the other item's index. The page applies it with its own pure helper.
- `handle`: spread it on the element that starts the drag (pointer and keyboard listeners, aria, ref, and a guard that swallows the click after a drag). Elements inside a card marked `data-no-drag` (a remove button) never start one.
- Drag starts after 4 px, so a plain click still fires; the click after a drag is suppressed. Esc cancels. The bar auto-scrolls near the edges of its scrolling ancestor.
- `onActiveChange(false)` is called one tick after the drag ends, so the Escape that cancelled is not seen as free by a modal behind (`closeOnEscape={!dragging}`).
- Keyboard: Space on the focused handle picks up, arrows move it through the order (dnd-kit's `sortableKeyboardCoordinates`; the others slide as live), Space drops, Esc cancels. Insert only; no swap by keyboard. Enter is left alone (it clicks).
- Style: `sortable.module.css` (dimmed placeholder, swap outline; theme roles only). Restyle with `className` / `innerClassName`. The overlay copy is rendered by the item's own render prop (with no drag handle), portaled to `document.body`.

### Cross-panel (hooks only, no feature uses them yet)

Wrap several lists and targets in one `SortableProvider` (a `Sortable` outside any provider makes its own).

- Items carry a `Payload` (`{ type, data }`; `getPayload` on `Sortable`, default `{ type: listId, data: itemId }`). `useDragSource({ id, payload })` makes a lone draggable (a picker output); `SortableProvider`'s `renderOverlay` draws what follows the pointer for it.
- `useDropTarget({ id, accepts: ['chord'], onDrop })` returns `{ setNodeRef, isOver, canDrop, payload }`. A target that does not accept the payload type is never hit (`canAccept` in `payload.ts`).
- Items of another list are not drop zones for a foreign drag yet.
