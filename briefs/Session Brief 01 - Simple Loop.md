# Brief 01 — Strip to the simple loop

**Status:** active
**Goal:** reshape v0 into the single-task loop described in SPEC.md. Remove the cut features from the code entirely, not just from the UI.

## Precondition
Git tag `v0-full-editor` exists on the remote. If it doesn't, stop and tell me.

## Remove
- Multi-segment sessions: the Completed-task / lap control, lap time display, next-task choice after a lap.
- The session editor and everything that only it used (allocation, over-allocation note, split/add segment).
- The Segment record. Task and duration move onto Session.
- Unfinished vs. Completed, everywhere (review, History, median logic).
- Excluded-from-stats toggle.
- Discarded sessions: canceling now saves nothing.
- fixed/flexible `durationMode`, `estimateMin`, `minMin`/`maxMin` naming, `category`, `targetFrequencyDays`, `preferredTimes`, `medianAlert`.
- The reserved PickerEvent table.
- Alert coalescing and the "Combine Close Alerts" setting.

## Change
- **Start screen:** larger Tasks / History / Settings controls; Tasks and History more prominent and distinct. Window input stays as built.
- **Task selection:** sortable table (task, last done), "Start Anything" top row, select-then-Start button with dynamic label, collapsible "+ New Task" with "Start What?" state, new window filter rules.
- **Timer:** visual 3‑2‑1 lead-in with beeps, countdown mode when the task has a maximum (auto-end at zero), bigger X.
- **Review:** new layout with the two deltas; "Add to tasks?" for Start Anything sessions.
- **Task-name combobox:** new shared component (fuzzy match, no duplicates, archived last).
- **Tasks tab:** + button, search, archived filter, "…" menu (Edit / Archive / Delete with cascade), full-property sheet.
- **History:** new two-line row format, "…" menu with Delete, no editor.
- **Alerts:** window alert pattern (3 short + 1 long); single task alert (goal, else median), off by default per task; skip within 1 minute of the window alert. Voice defaults to off. Set `navigator.audioSession.type = 'playback'` in the Start tap so alerts play through the silent switch. (Alerts already confirmed firing on device; the silent switch was muting them.)
- **Data:** new Task and Session shapes per SPEC §3; export `schemaVersion: 2`.

## Open questions (ask me before deciding)
- ~~Existing local data is test data. Plan: reset the database on upgrade rather than migrate.~~ Confirmed 2026-11-13: reset on upgrade; import rejects `schemaVersion: 1` files.
