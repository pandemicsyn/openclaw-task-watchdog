# openclaw-task-watchdog

Detached Work Health watchdog for OpenClaw tasks.

## Milestone status

### Milestone 1 (complete)

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

### Milestone 2 (complete)

- Rule model + action model (webhook/email/main session prompt)
- Rule engine for event/action matching
- Cooldown + dedupe tracking
- Escalation-aware suppression bypass (`warning -> critical`)
- Action executor path for:
  - webhook
  - email
  - main session prompt
- End-to-end action processing pipeline (`processAlertActions`)

## Scripts

- `pnpm test`
- `pnpm run typecheck`
- `pnpm run build`

See implementation notes in `plans/deviations-log.md`.
