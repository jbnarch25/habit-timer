# CLAUDE.md

Read SPEC.md before doing anything. It is the source of truth.

- Build only the chunk marked "BUILD THIS NOW". DONE chunks describe what exists; PLANNED items and Open UI questions are context, not tasks.
- Chunks after the first are written as changes to existing code. Rework what's there; don't rebuild working services or the data layer.
- If the spec is ambiguous or something isn't feasible as written, ask before inventing. If a chunk doesn't specify UI details, keep them minimal and note them as placeholders rather than designing them.
- When a chunk is finished: mark it DONE in SPEC.md, summarize what was built, and note any deviations from the spec (in SPEC.md, not just in chat).
- Data changes must preserve existing on-device data. Any Dexie schema/index change needs a version bump with an upgrade function.
- Keep it simple: personal-use app, no backend, no accounts, no analytics.
- Owner tests on a real iPhone (home-screen install), so iOS Safari behavior is what matters.
