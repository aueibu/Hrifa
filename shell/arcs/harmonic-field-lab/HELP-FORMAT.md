# Lab help text format (M1 decisions, 2026-11-15)

Confirmed by the human while reviewing the `Play scale`, `Hover and hold 1, 4, 5` and `Modes (heat grid)` mockups. This is the spec M2 to M8 build to. It becomes a rules section of the page `ARCHITECTURE.md` at close-out.

## 1. Two layers per entry
- **Help** (tooltip and glossary): what it does, in a few short blocks. Target about 300 to 500 characters.
- **Teaching** (glossary only, after a rule): the longer explanation, edge cases, worked examples, the numbers behind it. Split into small blocks; one idea per block.
- Search covers both layers.

## 2. Block kinds
| Block | Look | Layer |
| ----- | ---- | ----- |
| Term | bold line at the top | help |
| Paragraph | plain text | help or teaching |
| `Example:` | blank line before; label in italics | help (one at most) or teaching |
| `Keys:` | label, then one row per key: key name, then what it does | help |
| Dynamic | directly under the term, blank line after; the same colour as the rest of the tooltip, plain (human, 2026-11-16: whole tooltip uniform; supersedes S4 = A muted) | help, never in the glossary |

Order in a tooltip: term, the dynamic block (if any, always directly under the term so it is in a fixed place), help paragraphs, keys, then the example last. The glossary help has no dynamic block (human, 2026-11-16, revises the earlier order) (human, 2026-11-16: "like the flavor text on a card"). Source order in `texts.ts` follows it. The `Keys:` label is plain, not italic. A tooltip never changes size or position for its content (UI-CONVENTIONS section 1).

## 3. Emphasis
- **Bold**: a name the reader can find on screen (a control, a key, a mode name as shown).
- *Italic*: the `Example:` label and a term being defined at its first use in the entry.
- Nothing else is bold or italic. Numbers and values use the number font (`Num`).
- Written as `**bold**` and `*italic*` in the entry strings; one parser turns them into nodes; no raw HTML.

## 4. Dynamic text
- The dynamic block first, directly under the term, a blank line, then the fixed help (S5: "3 of the subset's 7 notes are in this key", then the help paragraph, then `Keys:`). Position, not colour, marks it as dynamic.
- Dynamic tooltips move from the native `title` attribute to the styled tooltip (S6 = B, leaning yes; the wrapper cost was discussed 2026-11-15). The Developer menu's tooltip on/off and delay apply to all of them.

## 5. Which controls get a tooltip
Decided panel by panel at the M4 to M7 wording reviews, not up front.

## 6. Shortcuts stay in sync (proposed, awaiting the human's OK)
One table of the lab's shortcuts in code; the handlers and the help text both read it, and a test fails on a literal that disagrees. Found at M1: the Parallel | Relative switch is key **0** (code: `useLabAudio.ts`; `holdToPlay` and `modePlayback` say 0) but `modes` says "the 5 key". Key 0 is right; `modes` gets fixed when it is converted.
