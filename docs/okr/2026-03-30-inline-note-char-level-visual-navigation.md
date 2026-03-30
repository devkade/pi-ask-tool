# OKR — Char-Level Visual Navigation for Wrapped Inline Note Editing

Date: 2026-03-30
Related track: B2 (follow-up to wrapped inline note visual cursor work)
Related context:
- issue #1 comment `#issuecomment-4150421927`
- existing intermediate fix: word-wrap-based visual movement (`B1`)

## Objective

Make wrapped inline note editing in `pi-ask-tool` follow the **actual visible rendered lines** so that `↑` and `↓` move the caret one on-screen line at a time, even in the presence of repeated spaces, reflow-sensitive content, and inline renderer-specific wrapping.

## Why This Exists

The current intermediate solution improves vertical movement by using `pi-tui` editor internals for visual-line movement. However, those internals are based on the editor's own `wordWrapLine` segmentation, which is not guaranteed to match the exact visual rows produced by `pi-ask-tool`'s inline option renderer.

That means the current state can still diverge from the user's actual visual expectation in cases like:
- repeated spaces
- wrap-sensitive phrase boundaries
- inline prefix/marker/separator width effects
- renderer-specific wrapping differences

This OKR defines the next step: movement based on **the rendered rows the user actually sees**, not only on editor-internal wrapped segments.

## Desired User Behavior

When an inline note is visually wrapped across multiple on-screen rows:
- `↑` moves the caret to the visible row above
- `↓` moves the caret to the visible row below
- movement preserves the same visible column when possible
- if the target row is shorter, the caret clamps to the nearest valid visible position
- behavior remains stable even when the text contains repeated spaces
- behavior matches what the user sees, not merely what the editor's internal word-wrap model predicts

## Key Results

1. **Rendered-row semantics**
   - Inline note cursor movement uses the same row segmentation as the displayed inline note rendering.

2. **Char/cell-accurate vertical movement**
   - `↑` / `↓` preserve visible column position as closely as possible on the target rendered row.

3. **Repeated-space robustness**
   - Cases with multiple spaces do not cause obviously incorrect vertical jumps or misleading reflow behavior.

4. **Renderer parity**
   - The mapping used for cursor movement matches the wrapping used by inline note display.

5. **Cross-screen consistency**
   - The same behavior works in:
     - `ask-inline-ui.ts`
     - `ask-tabs-ui.ts`

6. **Regression safety**
   - Add focused tests for repeated spaces, short/long row transitions, and rendered-row movement.

7. **Quality bar maintained**
   - `npm run typecheck` passes
   - targeted UI tests pass
   - existing note editing behavior remains intact

## Acceptance Criteria

### Functional behavior
- `↑` / `↓` move by one **visible rendered row** at a time.
- Movement follows the actual wrapped rows shown in the inline note UI.
- `←` / `→` remain logical left/right movement.
- `Tab`, `Esc`, `Enter`, submit, cancel, and `Other` validation rules remain unchanged.

### Stability behavior
- Multiple spaces do not produce obviously incorrect row targeting.
- Movement from long row → short row clamps safely.
- Movement from short row → long row restores as much visible column as possible.
- Width changes produce a new correct rendered-row map before subsequent `↑` / `↓` movement.

### Scope behavior
- Single-question inline ask flow supports rendered-row movement.
- Tabbed ask flow supports rendered-row movement.
- No UX regression for inline note editing when no wrapping occurs.

## Key Scenarios

### Scenario 1 — Wrapped note with normal spacing
- A note wraps into three visible rows.
- `↑` / `↓` move between those rows predictably.

### Scenario 2 — Repeated spaces
- A note contains multiple spaces between words.
- The visible wrapping may shift in non-trivial ways.
- `↑` / `↓` still follow the actual rendered rows.

### Scenario 3 — Long row to shorter row
- Caret starts near the end of a long rendered row.
- Moving to a shorter row clamps to the nearest valid visible position.

### Scenario 4 — Short row back to longer row
- After clamping onto a shorter row, moving back should preserve as much intended visible column as possible.

### Scenario 5 — Same behavior in tabbed flow
- A wrapped inline note in tabbed ask uses the same movement semantics as the single-question flow.

### Scenario 6 — Resize-aware follow-up movement
- After width changes and rewrap, the next `↑` / `↓` action uses the new rendered-row map.

## Proposed Implementation Direction

## Core principle
Do not rely solely on `pi-tui`'s internal editor visual-line map for vertical navigation.
Instead, compute cursor movement from the **same rendered-row model used by the inline note UI**.

### Minimum architectural pieces
1. **Rendered-row map generator**
   - Produces the same wrapped rows used by inline note rendering
   - Tracks source index ranges for each rendered row

2. **Cursor position mapper**
   - Converts current source cursor index → rendered row + visible column

3. **Rendered-row movement function**
   - Moves to row - 1 / row + 1
   - Preserves visible column where possible
   - Clamps safely when needed

4. **Source-index resolver**
   - Converts target rendered row + visible column back to source cursor index

### Suggested file shape
A focused helper module is preferred, for example:
- `src/ask-inline-note-map.ts`
- or equivalent naming

This helper should be the source of truth for:
- rendered inline note rows
- cursor-to-row mapping
- row-based cursor movement

### Important constraint
The wrapping logic used for cursor movement must match the wrapping logic used for rendering.
If these diverge, the UI will appear inconsistent even if the code "works."

## Non-goals

- Replacing the `Editor` implementation
- Replacing `pi-tui`
- Broad terminal layout framework work
- Solving unrelated tmux resize redraw issues in this same task
- Redesigning the inline note UX into a separate modal/editor

## Risks

- Source index ↔ rendered row/column mapping can become subtle around repeated spaces.
- ANSI/cursor rendering details must not leak into logical mapping assumptions.
- Width changes can invalidate preferred-column memory if not handled carefully.
- Single-question and tabbed flows could drift if the mapping helper is not shared.

## Definition of Done

This OKR is complete when:
- `↑` / `↓` in wrapped inline note editing follow actual visible rendered rows
- repeated-space cases behave consistently with on-screen expectations
- single-question and tabbed flows share the same movement semantics
- existing editing behavior remains intact
- tests cover the important rendered-row edge cases
- `npm run typecheck` and targeted tests pass

## Suggested Work Breakdown

1. Define a rendered-row map structure for inline notes.
2. Extract or unify wrapping behavior so rendering and movement share the same model.
3. Implement cursor-index → rendered-row/column mapping.
4. Implement rendered-row up/down movement.
5. Integrate into `ask-inline-ui.ts`.
6. Integrate into `ask-tabs-ui.ts`.
7. Add repeated-space and clamp behavior tests.
8. Verify behavior in real `pi` + tmux interaction.
