# openclaw-task-watchdog

Detached Work Health watchdog for OpenClaw tasks.

## Implemented phases

### Phase 0 — foundation

- Config schema (`zod`) for thresholds, rules, actions, provider config
- Alert/event/action model
- Dedupe/cooldown state
- Health snapshot structure

### Phase 1 — cron-first detector

- Task runtime input model
- Cron filtering
- Detection for:
  - `task_failed`
  - `task_timed_out`
  - `task_lost`
  - `task_stale_running`
  - `delivery_failed`
- Health events + snapshot output

### Phase 2 — actions

- Webhook action (real HTTP POST via fetch)
- Main-session prompt action (system-event publisher bridge)
- Email rendering via React Email (`@react-email/render`)
- Email providers:
  - Resend (SDK)
  - Nodemailer (SMTP transport)
- Rule/action engine with cooldown + dedupe + escalation bypass

## Scripts

- `pnpm test`
- `pnpm run typecheck`
- `pnpm run build`

## Notes

See `plans/deviations-log.md` for scoped deviations and follow-ups.
