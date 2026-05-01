# OKR — Overflow/Scroll Stability for Ask UI

Date: 2026-03-30
Related issue: #5 — Unable to scroll upwards when prompt/context/options height exceeds terminal height
Scope: `pi-ask-tool` ask UI overflow behavior in `ask-inline-ui.ts` and `ask-tabs-ui.ts`

## Objective

Make `pi-ask-tool`'s ask UI reliably navigable in small terminals and long-context flows so users can read, move, and answer without the interaction breaking when rendered content exceeds terminal height.

## Problem Statement

The current ask UI supports width-based wrapping for long questions, descriptions, and inline notes, but it does not appear to manage vertical overflow with a height-aware viewport. When total rendered content exceeds terminal height, users can lose access to earlier lines or fail to navigate naturally through the full prompt/context/options area.

## Key Results

1. **Small terminal support**
   - Single-question UI and tabbed UI both remain usable at terminal heights of **12, 16, and 20 rows**.

2. **Overflow navigability**
   - When total rendered lines for `question + description + options` exceed **2x terminal height**, the user can still reach:
     - the first visible content region,
     - the last option,
     - and the submit area (when applicable).

3. **Viewport correctness**
   - After `↑↓` movement, `←→` tab switches, and inline note edit entry/exit, the **active option / active review line stays visible 100% of the time**.

4. **Behavior parity across screens**
   - Overflow handling is consistent across:
     - single-question flow,
     - multi-question tabs,
     - submit review tab,
     - and `Other` note-editing states.

5. **Regression protection**
   - Add at least **5 overflow-focused test scenarios** covering movement, submission, cancellation, and note editing.

6. **Quality bar maintained**
   - `npm run check` continues to pass after the change.
   - UI coverage for touched modules remains at or above the current practical quality bar.

7. **Manual validation outcome**
   - Zero reproducible cases remain for:
     - “can’t scroll back up”,
     - “content gets cut off in a way that blocks answering”,
     - or “current selection/caret disappears off-screen”.

## Quantified Acceptance Criteria

### Terminal height targets
- Minimum verified height: **12 rows**
- Stability target range: **12 / 16 / 20 rows**

### Long-content stress cases
- Description length: **20+ rendered lines**
- Option count: **8+ options**
- Wrapped inline-note cases: **24+ total rendered lines**
- Multi-question review: enough questions to force submit-tab overflow

### Viewport rules
- The active cursor target must always remain within the visible viewport.
- Entering note edit mode must keep the edited option/caret region visible.
- Leaving note edit mode must preserve a sensible viewport around the active option.
- Switching tabs must preserve usability; at minimum, the active target must not render off-screen.

### Input guarantees under overflow
- `Enter` keeps its current meaning.
- `Esc` keeps its current meaning.
- `Ctrl-C` keeps its current meaning.
- `Other` still requires note input before valid submission.

## Core Scenarios

### Scenario 1 — Single question with long description
- A single question includes a long Markdown/plain-text description that exceeds terminal height.
- The user can navigate downward to options.
- The user can navigate upward again to re-read the earlier context.
- The user can still submit a valid answer.

### Scenario 2 — Single question with long wrapped inline notes
- Several options include long inline notes.
- Wrapped note rendering increases total vertical height.
- The currently edited option and visible caret region remain on-screen while editing.

### Scenario 3 — Multi-question tabs with uneven heights
- Question 1 is short.
- Question 2 has a long description.
- Question 3 has many options and long notes.
- Switching tabs remains usable and the active target stays visible.

### Scenario 4 — Submit review tab overflow
- Enough questions exist to make the review/submit tab exceed terminal height.
- The user can inspect incomplete answers.
- The user can still submit once all validations pass.

### Scenario 5 — `Other` option with required note
- The user selects `Other` in a long-overflow screen.
- Inline note editing opens and remains visually usable.
- Empty note state still blocks valid submission.

### Scenario 6 — Small terminal with recommended option
- The recommended option is not near the top.
- Initial selection/cursor visibility is still correct in a short terminal.

### Scenario 7 — Cancel behavior under deep overflow
- After moving deep into a long screen, `Esc` and `Ctrl-C` still cancel correctly.
- Cancellation behavior remains unchanged by viewport logic.

## Deliverables

- Update `src/ask-inline-ui.ts`
  - add height-aware viewport behavior
  - track scroll offset
  - keep active option/editor region visible

- Update `src/ask-tabs-ui.ts`
  - add height-aware viewport behavior for question tabs
  - add overflow handling for submit review tab
  - ensure visibility rules during tab switching and editing

- Add tests
  - overflow render scenarios
  - movement/visibility scenarios
  - submit-tab overflow scenario
  - `Other` note-entry scenario
  - cancel behavior under overflow

- Update `README.md`
  - document that long content remains navigable vertically
  - document any new navigation behavior if keys or interaction rules change

## Implementation Notes

### Preferred design shape
- Separate **line generation** from **viewport slicing**.
- Keep wrapping logic width-based and deterministic.
- Introduce a simple vertical viewport model:
  - `scrollOffset`
  - `viewportHeight`
  - `activeLineIndex`
- Recompute/adjust offset whenever:
  - cursor moves,
  - editing starts/stops,
  - tab changes,
  - terminal size changes,
  - submit screen is entered.

### Reuse goal
- If practical, extract a small helper for vertical viewport calculations so single-question UI and tabbed UI do not diverge.

## Non-goals

- Replacing the existing TUI framework
- Mouse support
- A full virtual scrolling/layout engine
- Tool schema/API changes unrelated to overflow behavior
- Cosmetic redesign beyond what is needed for readable overflow handling

## Risks

- Inline note editor visibility could drift from the rendered caret position.
- Submit-tab overflow may require slightly different viewport logic from question tabs.
- Width wrapping + height scrolling interactions can make UI tests brittle if not structured carefully.
- Terminal resize behavior may introduce hidden state bugs if offset logic is not centralized.

## Definition of Done

This OKR is considered complete when all of the following are true:

- Issue #5 can no longer be reproduced locally using long-content scenarios.
- Overflow-focused automated tests have been added.
- `npm run check` passes.
- README reflects the resulting behavior where relevant.
- Active selection/caret visibility is preserved across the supported overflow scenarios.

## Suggested Work Breakdown

1. Reproduce overflow in the smallest deterministic local scenario.
2. Define viewport invariants and offset-adjustment rules.
3. Patch single-question UI.
4. Patch tabbed-question UI.
5. Patch submit review overflow handling.
6. Add overflow-focused tests.
7. Run full verification (`npm run check`).
8. Update docs and close the issue with verified behavior notes.
