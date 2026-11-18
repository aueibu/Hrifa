# SCENARIOS M8g: subset product (CONFIRMED 2026-11-18)

Q2 option 1 (added into the Relative tab's field). Added: a **Merge within ___ c** box in the dialog, starting at the Developer merge tolerance (default 5 c); 0 = only exact equals merge (the human: "okay lets"). Runtime only (not stored).

Answers 2026-11-18: Q1 option 1 (Product... dialog on the subset row); Q3 option 1 (new Relative tab); Q4 option 1 (subset becomes the product); Q5 option 1 (merge by the lab's tolerance; the human: "this is an interesting one because I want to get into comma and high ratio stuff later on"); Q6 option 1 (ghosts + count); Q7 option 1 (refuse with the count). Q2 not answered yet.

Drafted 2026-11-18. The human's words: "a function that creates the cartesian product of a subset on a field ... take the ratios from the subset and project those from each (or user selectable) ratio in the same or another subset."

Terms: **Sources** = the notes the shape is placed on. **Shape** = the ratios placed on each source. "This subset" = the tab's live subset; "saved subset" = one in the generator library (stored as pitches, so it can come from another generator). Every product is folded into the field's repeat (an octave here), like every other note in the lab.

Running example: A = major triad {1/1, 5/4, 3/2}; B = minor triad {1/1, 6/5, 3/2}.

## Results (these rows become the tests)

| # | Sources | Shape | Direction | Steps | Products -> distinct pitches |
| - | ------- | ----- | --------- | ----- | ---------------------------- |
| P1 | A (all) | A | Up | 1 | 9 -> {1/1, 9/8, 5/4, 3/2, 25/16, 15/8} (6) |
| P2 | A, only 3/2 picked | A | Up | 1 | 3 -> {9/8, 3/2, 15/8} (A moved up a fifth) |
| P3 | A | B | Up | 1 | 9 -> {1/1, 9/8, 6/5, 5/4, 3/2, 9/5, 15/8} (7) |
| P4 | A | A | Down | 1 | 9 -> {1/1, 6/5, 5/4, 4/3, 3/2, 8/5, 5/3} (7: the tonality diamond) |
| P5 | A | A | Both | 1 | P1 and P4 together -> {1/1, 9/8, 6/5, 5/4, 4/3, 3/2, 25/16, 8/5, 5/3, 15/8} (10) |
| P6 | A | A | Up | 2 | 27 -> 10: {1/1, 9/8, 75/64, 5/4, 45/32, 3/2, 25/16, 27/16, 15/8, 125/64} |
| P7 | {1/1} | A | Up | 1 | A itself (a one-note source copies the shape) |

Up = source x shape ratio; Down = source / shape ratio (the shape hung below each source); Steps n = the shape applied n times in a row (Steps 2 = Sources x Shape x Shape).

## Open choices (options shown where they give different results)

| # | Question | Option 1 | Option 2 | Example where they differ |
| - | -------- | -------- | -------- | ------------------------- |
| Q1 | Where the button lives | A **Product...** button on the subset row, opening a small dialog (Sources, Shape, Up/Down/Both, Steps, live count) | A **Project subset** button inside the Relative picker, using the picker's note as the one source | Option 2 can only do P2/P7-style single sources; Option 1 does all rows |
| Q2 | Where the result goes in a Relative tab | Added into this field | Always a new tab | Field {1/1, 5/4, 3/2, 7/4}, P1: Option 1 gives one field of 7 notes (7/4 kept); Option 2 leaves this tab alone and opens a 6-note tab |
| Q3 | Where it goes from any other method (its field comes from the generator, it cannot take extra notes) | A new tab with the **Relative** method (its notes are a free list you can keep editing in the picker) | A new **Custom** tab (a fixed scale) | Same notes; Option 1 can then take Shift+click / picker additions and right-click removals |
| Q4 | The subset after adding | Becomes exactly the product's notes | Stays as it was | Field of 12 notes, P1: Option 1 lights the 6 products on the ring; Option 2 keeps the triad lit and the 3 new notes hollow |
| Q5 | A product within a few cents of an existing note | Merged by the lab's merge tolerance (Developer, default 5 c) | Kept unless exactly equal | Sources {1/1}, Shape {3/2}, Steps 8, field holding 8/5: 6561/4096 lands 1.95 c from 8/5. Option 1 drops it; Option 2 adds a second note 2 c away |
| Q6 | Preview before adding | Ghost marks on the ring plus "9 products, 6 distinct, 3 already in field" while the dialog is open | No preview, just the count | - |
| Q7 | Over the 256-note cap of a Relative field | Refuse with the count (a 7-note shape at Steps 3 on 7 sources: "this would make 310 notes; the cap is 256") | Add the first 256 | - |
