# Pi Ask Tool Extension

An extension for the [Pi coding agent](https://github.com/badlogic/pi-mono/) that adds a structured `ask` tool with interactive, tab-based questioning and inline note editing.

```ts
ask({
  questions: [
    {
      id: "auth",
      question: "Which authentication model should we use?",
      options: [{ label: "JWT" }, { label: "Session" }],
      recommended: 1
    }
  ]
})
```

## Why

When an agent needs a decision from you, free-form prompts are slow and inconsistent.
This extension provides:

- **Structured options** with clear IDs and deterministic outputs
- **Single + multi-select** in one tool
- **Tab-based multi-question flow** with a final submit review tab
- **Inline note editing** (no large UI pane shifts)
- **Automatic `Other (type your own)` handling**

## Install

### From npm

```bash
pi install npm:pi-ask-tool-extension
```

### From git

```bash
pi install git:github.com/devkade/pi-ask-tool@main
# or pin a tag
pi install git:github.com/devkade/pi-ask-tool@v0.1.0
```

### Local development run

```bash
pi -e ./ask-extension.ts
```

## Quick Start

### Single question (single-select)

```ts
ask({
  questions: [
    {
      id: "auth",
      question: "Which auth approach?",
      options: [{ label: "JWT" }, { label: "Session" }],
      recommended: 1
    }
  ]
})
```

Result example:

```txt
User selected: Session
```

### Single question (multi-select)

```ts
ask({
  questions: [
    {
      id: "features",
      question: "Which features should be enabled?",
      options: [{ label: "Logging" }, { label: "Metrics" }, { label: "Tracing" }],
      multi: true
    }
  ]
})
```

Result example:

```txt
User selected: Logging, Metrics
```

### Multi-question (tab flow)

```ts
ask({
  questions: [
    {
      id: "auth",
      question: "Which auth approach?",
      options: [{ label: "JWT" }, { label: "Session" }]
    },
    {
      id: "cache",
      question: "Which cache strategy?",
      options: [{ label: "Redis" }, { label: "None" }]
    }
  ]
})
```

Result example:

```txt
User answers:
auth: Session
cache: Redis
```

## Interaction Model

| Flow | UI style | Submit behavior |
|---|---|---|
| Single + `multi: false` | one-question picker | Enter submits immediately |
| Single + `multi: true` | tab UI (`Question` + `Submit`) | Submit tab confirms |
| Multiple questions (mixed allowed) | tab UI (`Q1..Qn` + `Submit`) | Submit tab confirms all |

## Inline Notes (Minimal UI Transitions)

Press `Tab` on any option to edit a note inline on that same row.

- Display format: `Option — note: ...`
- Editing cursor: `▍`
- Notes are sanitized for inline display (line breaks/control chars)
- Narrow-width rendering keeps the edit cursor visible

For `Other`, a note is required to become valid.

## Keyboard Shortcuts

- `↑ / ↓`: move between options
- `← / →`: switch question tabs
- `Enter`: select/toggle or submit (on Submit tab)
- `Tab`: start/stop inline note editing
- `Esc`: cancel flow

## Tool Schema

```ts
{
  questions: [
    {
      id: string,
      question: string,
      options: [{ label: string }],
      multi?: boolean,
      recommended?: number // 0-indexed
    }
  ]
}
```

> Do **not** include an `Other` option in `options`. The UI injects it automatically.

## Development

```bash
npm install
npm test
npm run typecheck
```

## Project Structure

- `ask-extension.ts` - extension entrypoint
- `src/index.ts` - tool registration and orchestration
- `src/ask-logic.ts` - selection/result mapping helpers
- `src/ask-inline-ui.ts` - single-question UI
- `src/ask-tabs-ui.ts` - tabbed multi-question UI
- `src/ask-inline-note.ts` - inline note rendering helper
- `test/*.test.ts` - logic + UI mapping + integration coverage
