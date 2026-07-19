# Grid Traversal Workshop

A standalone browser prototype for authoring one compound move per piece, placing individual tokens, and observing how energy, state transitions, occupancy, and boundaries determine final resting positions.

Open `index.html` in a browser. It has no external dependencies.

The workshop automatically saves its definitions, token placements, board state, histories, and simulation state in that browser's local storage. Refreshing the page restores the local workshop. `Delete selected` removes a stable piece and all of its placed tokens.

Double-click a stable piece title to rename it inline. The new name is applied to existing tokens and saved locally.

## Current scope

- Resizable square board: 12 × 12, 16 × 16, 20 × 20, 24 × 24, 32 × 32, or 64 × 64; valid cells, states, and placed pieces are retained when resizing.
- Move syntax: `[direction,distance.change,intensity]`, chained into one compound move. Distance can be a fixed integer or per-token variable `n`.
- The `n` editor specifies its starting value, its change, and how many completed movement cores occur before it changes. Every placed token owns an independent `n` value and cadence.
- `>` turns a token clockwise and `<` turns it counter-clockwise; turns cost no energy and affect no cell.
- `o`: unchanged; `x`: paint up to an absolute state; `+`: raise relatively; `-`: lower relatively.
- Every token receives its own fixed forward orientation at placement time.
- Clicking a placement cell opens four directional arrows; choose one to commit that token.
- Active tokens show their current facing arrow and energy directly on the grid.
- `Resolve` runs the same ordered simulation without visual playback, then renders the final field. It pauses after 50,000 rounds if active zero-cost loops remain.
- `Reset grid` removes all placements and restores every cell value to state 0; piece definitions remain in the stable.
- `Reset pieces` restores every placed token to its original cell, orientation, energy, and active status, and restores every cell value to state 0.
- Select a stable piece to load its rules into the editor. That editor selection persists through board interaction and refreshes until `New` is chosen. `Update piece` changes that definition; `Save as new piece` creates an independent copy with the edited rules.
- Click a placed token to open its local menu: manually move it, reorient it, or remove it.
- Tokens are placed individually; co-occupancy is allowed at +2 energy per existing occupant.
- State transition costs: 0->1 = 0, 1->2 = 1, 2->3 = 2.
- Off-board next step becomes `Imp`.
- Rest states: `Ex`, `Un`, `Int`, `Imp`.
