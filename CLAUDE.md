# CLAUDE.md

Personal-use iPhone PWA. No backend, no accounts, no analytics. The owner tests on a real iPhone (home-screen install), so iOS Safari behavior is what matters.

## Project docs

- **SPEC.md** — what the app is. Source of truth for behavior. Build against it.
- **briefs/** — the active brief says what to change this round. Work only on the active brief.
- **DECISIONS.md** — why things are the way they are. Newest entries at the TOP. When a decision is made in a session (by me, or by you with my approval), add an entry at the top. Never rewrite old entries; a reversal is a new entry that says what it reverses.
- These docs are shared with a separate Claude Project used for design discussion. Keep SPEC, DECISIONS, ROADMAP and briefs accurate whenever a session changes something, so both sides see the same picture.
- **ROADMAP.md** — future ideas. Context only. Never build anything from it.

## How to work

- Before changing code, read the active brief and the relevant SPEC sections, then **post a short plan and wait for approval.** Don't start on assumptions.
- If the brief or spec is ambiguous, contradictory, or not feasible as written, **ask. Don't invent.**
- Stay inside the brief. If you notice something outside it worth doing, mention it in one line; don't do it.
- Keep plans and summaries short: what changes, which files, anything you need from me.
- Commit in small, logical steps with clear messages.

## Session Briefs

- Briefs live in briefs/, named `Session Brief ## - Title.md` (two-digit number, e.g. `Session Brief 01 - Simple Loop.md`). Archived briefs go in briefs/archive/.
- Each brief has a Status line: draft, active, built, or done. Work only on the brief marked active. Ignore drafts. There is never more than one active brief.
- When the work is complete, set the status to built and add a short Summary section to the brief: what changed, anything that deviated from the brief, and anything left for me to test.
- Never set a brief to done. I do that after testing on device. When I mark one done, move it to briefs/archive/.