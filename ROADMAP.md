# Habit Timer — ROADMAP

Ideas for later. Nothing here gets built until it moves into a brief. "Revisit when" is the condition for bringing an idea back up; it's checked whenever a new chunk is planned.

---

**Custom task categories**: group and filter tasks by user-defined categories.
*Revisit when:* the task list gets long enough to need grouping, or the Tasks tab is redesigned.

**Visual design pass**: layout, typography, look and feel of every screen.
*Revisit when:* the foundational loop feels right in daily use.

**Multi-segment sessions and session editor**: laps within a session, after-the-fact allocation of time across tasks. Full design and code at tag `v0-full-editor`.
*Revisit when:* single-task sessions start feeling limiting in real use.

**History editing**: change a past session's task or duration.
*Revisit when:* deleting and redoing a session becomes a recurring annoyance.

**Picker**: "choose for me" and "show options" from the tasks that fit a window, weighted by staleness. Could use frequency targets, time-of-day preferences, and reroll history.
*Revisit when:* there's enough real session history for staleness to mean something.

**Frequency targets and preferred times**: task properties feeding staleness and suggestions.
*Revisit when:* the picker is being planned.

**Countdown overtime**: let a maximum-timed session keep counting past zero instead of auto-ending.
*Revisit when:* auto-end cuts off something you wanted to finish.

**Unfinished runs**: some way to keep bailed-early runs out of the median.
*Revisit when:* medians start looking wrong.

**Live concurrency**: one session timing several tasks at once (`taskId` → `taskIds[]`).
*Revisit when:* multi-segment sessions come back.

**Spoken alerts** (low priority): decide what the window and task alerts say, then turn Voice back on by default. The machinery already exists; it's off by default in Settings.
*Revisit when:* beeps alone feel insufficient.

**Push notifications**: a small backend for alerts while the app is backgrounded.
*Revisit when:* foreground-only alerts prove insufficient.
