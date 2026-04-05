# openclaw-task-watchdog

Cron-first Detached Work Health detector for OpenClaw task runs.

## Milestone 1 status

Implemented:

- Task runtime reader abstraction
- Cron-only runtime filtering
- Alert event generation for:
  - `task_failed`
  - `task_timed_out`
  - `task_lost`
  - `task_stale_running`
  - `delivery_failed`
- Health snapshot builder
- Baseline state tracking for transition detection
- Unit tests

See implementation notes in `plans/deviations-log.md`.
