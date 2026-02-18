## Summary

- What changed?
- Why was this needed?

## Validation

- [ ] `npm run check` passes locally (typecheck + tests + coverage gate)
- [ ] Added/updated tests for new behavior or branch changes
- [ ] No existing contract tests were weakened/removed without justification

## Ask Session Logging Contract (if `ask` result formatting changed)

- [ ] Each question includes **Prompt**, **Options**, and **Response** in session text
- [ ] Cancelled answers are explicitly represented
- [ ] `Other` / custom input is recorded with context
- [ ] `details` payload compatibility is preserved (no accidental breaking changes)

## Risk & Rollback

- Risk level: Low / Medium / High
- Rollback plan:

## Notes for Reviewer

- Any specific area that needs close inspection?
