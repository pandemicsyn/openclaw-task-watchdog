# openclaw-task-watchdog

Detached Work Health watchdog plugin for OpenClaw tasks.

## OpenClaw plugin integration

This repository is now wired as a native OpenClaw plugin:

- `index.ts` exports plugin entry via `definePluginEntry`
- `openclaw.plugin.json` provides plugin manifest + config schema
- `package.json` includes the `openclaw` metadata block
- plugin registers:
  - background service: `task-watchdog-service`
  - optional tool: `task_watchdog_check`

## Zod at I/O boundaries

All key I/O boundaries are validated with zod:

- plugin config input (`parsePluginConfig`)
- detached-work config (`parseDetachedWorkConfig`)
- runtime task JSON input (`parseTaskRunsFromUnknown`)
- tool invocation params (`checkToolInputSchema`)

## Implemented phases

### Phase 0 — foundation

- Config schema (zod)
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

- Webhook action (HTTP POST)
- Main-session prompt action (system-event bridge)
- Email rendering via React Email
- Email providers:
  - Resend
  - Nodemailer
- Rule/action engine with cooldown + dedupe + escalation bypass

## Scripts

- `pnpm test`
- `pnpm run typecheck`
- `pnpm run build`

## Notes

See `plans/deviations-log.md` for scoped deviations and follow-ups.
