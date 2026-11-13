# Habit Timer — DECISIONS

Newest first. Each entry: what was decided, and why. Don't edit old entries; when a decision changes, add a new entry at the top that says what it reverses.

---

### 2026-11-13 — Alert audio plays through the silent switch
Set `navigator.audioSession.type = 'playback'` inside the Start tap, so beeps follow the volume buttons, not the ring/silent switch. No fallback for older iOS.
**Why:** the phone is always on silent, and on-device testing showed alerts were firing but muted by the switch. Single device on current iOS, so the Audio Session API is enough.
**Trade-off accepted:** may pause or duck other audio (music, podcasts) during a session.

### 2026-11-13 — Spoken alerts off by default
Voice machinery stays, but the Voice setting defaults to off and the wording is unspecified. Moved to ROADMAP.
**Why:** with one alert at a time, the old combined announcement no longer fits, and beeps are enough for now.

### 2026-11-13 — Quick-create asks only for a name; the task survives cancel
"+ New Task" in task selection takes just the name. The task is created on Start and kept even if the session is canceled.
**Why:** keep starting low-friction; properties are managed in the Tasks tab.

### 2026-11-13 — Task selection sorts by last done, oldest first; lead-in cancels freely
X during the 3‑2‑1 lead-in cancels immediately, with no confirmation.
**Why:** surfaces neglected tasks; nothing has started during the lead-in, so there is nothing to confirm.

### 2026-11-13 — No restrictions on task property combinations
Any mix of minimum chunk, goal and maximum is allowed, even odd ones (for example, a goal longer than the maximum, so the task alert never fires).
**Why:** tasks vary widely, and the odd combinations just won't get used. Not worth validation logic yet.

### 2026-11-13 — Reset local data for the v1 schema
Existing on-device data is test data. The database is reset on upgrade rather than migrated, and import rejects `schemaVersion: 1` files.
**Why:** a migration would only serve to preserve throwaway data.

### 2026-11-13 — Project docs split into SPEC, DECISIONS, ROADMAP, briefs
SPEC.md describes the app as it is, by feature area. DECISIONS.md (this file) holds the reasoning, newest first. ROADMAP.md holds future ideas, each with an optional "revisit when" condition. Each chunk of work gets a short brief; once built, it's folded into SPEC and DECISIONS.
**Why:** the old single spec mixed decisions, implementation detail and future plans into one wall of text, so it wasn't clear what needed attention.

### 2026-11-11 — Guiding principle for v1: foundational loop first
Get the core loop (pick a window → pick a task → time it → review) working and feeling right before adding anything.
**Why:** v0 went deep on one area (multi-segment sessions and the editor) while the rest of the app stayed at day one. Develop breadth-first (a walking skeleton).

### 2026-11-11 — Cut multi-segment sessions and the session editor
One session = one task. No laps, no allocation editor. History is view and delete only. The full v0 version, code and spec, is preserved at git tag `v0-full-editor`.
**Why:** too much design up front, ahead of what was actually understood. Removed from the code rather than hidden, to keep the codebase clean.

### 2026-11-11 — Tasks have optional properties, not a fixed/flexible type
A task is a name plus optional minimum chunk, goal time and maximum. Behavior follows from which are set; the user never chooses a "type."
**Why:** the fixed/flexible distinction is real, but tasks feel more like things with available metadata than members of two categories.

### 2026-11-11 — Remove Unfinished vs. Completed
Every saved session counts toward the median.
**Trade-off accepted:** a run bailed on early will drag the median down. Canceling with X is the escape hatch.

### 2026-11-11 — Canceled and un-filed untitled sessions are not saved
Reverses v0, which kept them with a `discarded` flag. Departs from "capture raw data generously."
**Why:** not every stopwatch use needs capturing, untitled sessions realistically won't get filed later, and a canceled session has no meaning.

### 2026-11-11 — One task alert per session; window alert wins collisions
The task alert fires at the goal time if set, otherwise the median. If it falls within 1 minute of the window alert, it's skipped. Replaces v0's combined announcement and its "Combine Close Alerts" setting.
**Why:** simpler, and with only one task alert, goal and median can never collide.
