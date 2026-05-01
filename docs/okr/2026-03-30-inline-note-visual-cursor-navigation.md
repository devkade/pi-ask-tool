# Plan — Visual Up/Down Navigation for Wrapped Inline Note Editing

Date: 2026-03-30
Related source: issue #1 comment `#issuecomment-4150421927`
Scope: wrapped inline note editing behavior in `ask-inline-ui.ts` and `ask-tabs-ui.ts`

## Summary

Wrapped inline note editing currently presents note text across multiple visual lines, but `↑` and `↓` behavior appears to follow the editor's logical/raw-text cursor model rather than the user's visual-line expectation. This creates a mismatch: users see multiple wrapped lines, but vertical cursor movement does not behave like moving one visible line up or down.

This work should be tracked separately from overflow/viewport scrolling because it changes **cursor movement semantics**, not just screen visibility.

## Objective

Make `↑` / `↓` during wrapped inline note editing move the caret by **one visible wrapped line** at a time, preserving user expectations for vertical navigation.

## Problem Statement

Today, inline note editing uses the underlying editor for text state and cursor state, while the displayed caret is rendered inside a wrapped presentation layer. The displayed text is visually multi-line, but vertical movement does not appear to respect visual lines. In practice this means:

- `↑` / `↓` can feel like moving through raw text positions instead of visible rows
- behavior becomes more confusing with multiple spaces and wrapping/reflow
- caret display may be accurate, but movement semantics still feel wrong

## Desired Behavior

When a note is visually wrapped into multiple on-screen lines:

- `↑` moves the caret to the line above
- `↓` moves the caret to the line below
- horizontal position should be preserved as much as possible
- if the target line is shorter, the target position clamps to the nearest valid column
- `←` / `→` keep their existing logical left/right behavior
- `Enter`, `Tab`, `Esc`, and submit/cancel behavior remain unchanged

## Acceptance Criteria

1. **Visual-line vertical navigation**
   - In wrapped note editing, `↑` and `↓` move relative to visible lines rather than raw string positions.

2. **Preferred column preservation**
   - Repeated `↑` / `↓` attempts to preserve the same visual column when moving between wrapped lines.

3. **Line-length clamping**
   - When moving to a shorter line, the caret lands at the nearest valid position on that line.

4. **Whitespace robustness**
   - Multiple spaces and awkward wrap boundaries do not produce obviously broken vertical movement.

5. **Parity across both UIs**
   - Behavior is consistent in:
     - `ask-inline-ui.ts`
     - `ask-tabs-ui.ts`

6. **No regression in existing controls**
   - `←` / `→`, typing, submit, cancel, and `Other` note requirements continue to work.

7. **Verification**
   - Automated tests cover the main navigation scenarios.
   - `npm run check` passes after the change.

## Non-goals

- Replacing the text editor implementation entirely
- Adding mouse support
- Solving viewport overflow/scrolling in this same task
- Implementing a full terminal text-layout engine

## Key Scenarios

### Scenario 1 — Two visual lines
- A note wraps into exactly two visible lines.
- `↓` from the first line moves to the second line.
- `↑` from the second line returns to the first line.

### Scenario 2 — Three visual lines with preferred column
- A note wraps into three lines.
- Moving from line 1 → line 2 → line 3 preserves column where possible.
- Moving back upward restores the same approximate column.

### Scenario 3 — Shorter target line
- The caret is near the end of a long line.
- `↓` moves to a shorter wrapped line.
- Caret clamps to the valid end position of the shorter line.

### Scenario 4 — Multiple spaces in content
- The note contains repeated spaces.
- Wrapping changes the visual layout.
- `↑` / `↓` still behave according to visible lines instead of feeling random.

### Scenario 5 — Same behavior in tabbed flow
- Edit a note in multi-question tab UI.
- Wrapped vertical navigation behaves the same as in the single-question flow.

### Scenario 6 — Width-sensitive rewrap
- Terminal width changes cause rewrap.
- Subsequent `↑` / `↓` still produce consistent visual movement under the new layout.

## Implementation Direction

### Core approach
Intercept `↑` / `↓` while inline note editing is active and translate them into a **visual-line-aware caret move** before updating the underlying editor cursor.

### Likely components needed
1. **Current note text**
2. **Current linear cursor index** from the editor
3. **Wrap mapping** for the current render width:
   - visual line index
   - start/end source indices per visual line
   - visual column positions
4. **Preferred column state** for repeated vertical movement
5. **Cursor relocation function**:
   - find current visual line
   - target line = current ± 1
   - compute target source index from preferred column
   - clamp if needed
   - update editor caret position

### Architectural note
This likely deserves a small dedicated helper module, for example:
- `ask-inline-visual-cursor.ts`
- or a similarly named utility for wrapped cursor navigation

That helper should stay separate from rendering-only helpers so the distinction remains clear:
- rendering helper = how wrapped text is shown
- visual cursor helper = how caret movement maps across wrapped lines

## Risks

- The underlying `Editor` may not expose enough direct cursor-control APIs, which could require adapter workarounds.
- Multiple spaces and wrapped presentation may complicate source-index ↔ visual-column mapping.
- Width changes may invalidate preferred-column assumptions unless handled carefully.
- Shared behavior across both inline and tabbed UIs could drift if not centralized.

## Definition of Done

This work is complete when:

- `↑` / `↓` in wrapped inline note editing behave like visual one-line-up / one-line-down movement
- behavior is consistent across single-question and tabbed flows
- awkward spacing/wrapping cases are covered by tests
- existing note-editing behavior remains intact
- `npm run check` passes

## Suggested Work Breakdown

1. Inspect `Editor` cursor-control capabilities.
2. Define the wrap-to-source-index mapping model.
3. Build a small helper for visual vertical cursor movement.
4. Integrate it into `ask-inline-ui.ts` while editing is active.
5. Integrate the same logic into `ask-tabs-ui.ts`.
6. Add focused tests for wrapped vertical navigation.
7. Run full verification.
8. Document the behavior if needed in README or issue notes.
