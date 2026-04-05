# openclaw-task-watchdog

`openclaw-task-watchdog` is a native OpenClaw plugin for monitoring task health, starting with **cron task runs**.

It watches task execution state, detects failures and abnormal runtime conditions, and routes alerts through configurable actions such as:

- webhook delivery
- main-session prompts
- email via React Email + Resend/Nodemailer

This is intended for operators who want OpenClaw to notice when task health breaks, stalls, times out, or fails to deliver.

---

## What this plugin does

The plugin evaluates OpenClaw task runs and emits health events for cron work, including:

- `task_failed`
- `task_timed_out`
- `task_lost`
- `task_stale_running`
- `delivery_failed`
- `failure_streak`
- `recovered`

It then matches those events against configured rules and executes one or more actions.

---

## Architecture overview

At a high level, the plugin is split into four layers:

1. **Runtime ingestion**
   - Reads task runs from native OpenClaw runtime task APIs
   - Validates and normalizes task DTOs with zod

2. **Health detection**
   - Filters to cron runs
   - Detects failures, timeouts, lost tasks, stale-running tasks, delivery failures, streaks, and recovery
   - Produces health events and a health snapshot

3. **Rule evaluation**
   - Matches events against configured alert rules
   - Applies cooldowns and dedupe
   - Allows escalation when severity increases

4. **Action execution**
   - Delivers alerts via webhook, main-session prompt, or email
   - Uses retry/backoff for webhook/email transports

---

## OpenClaw integration

This repository is packaged as a native OpenClaw plugin:

- `index.ts` exports the plugin entry via `definePluginEntry(...)`
- `openclaw.plugin.json` provides manifest + static config schema
- `package.json` includes the OpenClaw plugin metadata block

The plugin registers:

- background service: `task-watchdog-service`
- optional tool: `task_watchdog_check`
- commands:
  - `task-watchdog-check`
  - `task-watchdog-status`

---

## Installation

### From source / local development

Clone the repo, install dependencies, and build/test it:

```bash
pnpm install
pnpm run format:check
pnpm run typecheck
pnpm test
pnpm run build
```

Then load/install it as an OpenClaw plugin using your normal local plugin workflow.

### As an OpenClaw plugin package

This repo includes:

- `openclaw.plugin.json`
- `package.json` `openclaw` metadata

So it is ready to be installed as a native OpenClaw plugin package.

---

## Configuration

The plugin config is expected under the plugin entry config in OpenClaw.

At a high level, config includes:

- polling / enablement
- thresholds by runtime
- alert rules
- alert actions
- email provider configuration

### Example config shape

```json
{
  "enabled": true,
  "pollIntervalMs": 60000,
  "detachedWork": {
    "thresholdsByRuntime": {
      "cron": {
        "staleRunningMinutes": 10,
        "criticalRunningMinutes": 20,
        "failureStreakCount": 3,
        "lookbackMinutes": 60
      }
    },
    "actions": [
      {
        "id": "ops-webhook",
        "kind": "webhook",
        "url": "https://example.com/webhook",
        "timeoutMs": 5000,
        "retryCount": 2
      },
      {
        "id": "main-prompt",
        "kind": "main_session_prompt",
        "wakeMode": "now",
        "prefix": "Task Health:"
      },
      {
        "id": "ops-email",
        "kind": "email",
        "provider": "resend",
        "to": ["ops@example.com"],
        "subjectPrefix": "[Task Health]",
        "retryCount": 2
      }
    ],
    "rules": [
      {
        "id": "critical-cron-events",
        "eventTypes": ["task_timed_out", "task_lost"],
        "runtimes": ["cron"],
        "actionIds": ["ops-webhook", "main-prompt", "ops-email"],
        "cooldownMinutes": 10
      },
      {
        "id": "cron-failures",
        "eventTypes": ["task_failed", "delivery_failed", "failure_streak"],
        "runtimes": ["cron"],
        "actionIds": ["ops-webhook", "ops-email"],
        "cooldownMinutes": 15
      }
    ],
    "emailProviders": {
      "resend": {
        "apiKey": "YOUR_RESEND_API_KEY",
        "defaultFrom": "watchdog@example.com"
      }
    }
  }
}
```

### Action types

#### Webhook

Use webhooks for automation, incident systems, or custom dashboards.

Fields:

- `url`
- optional `secret`
- optional `headers`
- optional `timeoutMs`
- optional `retryCount`

#### Main session prompt

Use this to route alerts into your main OpenClaw session.

Fields:

- optional `wakeMode`: `now` or `next-heartbeat`
- optional `prefix`

#### Email

Use email for operator-facing alerts and summaries.

Fields:

- `provider`: `resend` or `nodemailer`
- `to`
- optional `from`
- optional `subjectPrefix`
- optional `retryCount`

Provider config lives under `emailProviders`.

---

## Commands and tool surface

### Commands

#### `task-watchdog-check`
Run an immediate health check.

Example:

```text
task-watchdog-check
```

Dry run:

```text
task-watchdog-check dryRun=true
```

#### `task-watchdog-status`
Show the current health snapshot for the active session or a specified session key.

Example:

```text
task-watchdog-status
```

With explicit session key:

```text
task-watchdog-status sessionKey=main
```

### Tool

#### `task_watchdog_check`
Optional agent tool for triggering an on-demand watchdog check from within agent flows.

---

## Persistence

The plugin persists watchdog state under the OpenClaw plugin state directory.

Current persisted state includes:

- dedupe/cooldown tracking
- last-seen task state by task key (`taskId + runId`)
- recent incidents cache

State file:

- `task-watchdog/health-state.json`

Current envelope version:

- `version: 2`

---

## Retry / backoff behavior

Webhook and email transports now support retry-oriented action configs.

Current model:

- `retryCount` controls additional retry attempts beyond the first send
- retry uses exponential backoff with jitter
- main-session prompt delivery does **not** retry
- retry behavior is only applied to retryable transport failures

Examples of retryable conditions include:

- timeout / abort
- network failure
- HTTP `429`
- HTTP `502`, `503`, `504`

---

## Validation and safety

The plugin uses zod at important IO boundaries, including:

- plugin config input
- task health config input
- runtime task DTO normalization
- tool input
- command arg parsing
- persisted state load/save envelope

---

## Development

### Scripts

- `pnpm run format`
- `pnpm run format:check`
- `pnpm run typecheck`
- `pnpm test`
- `pnpm run build`

### CI

GitHub Actions runs:

- format check
- typecheck
- tests
- build

Workflow file:

- `.github/workflows/ci.yml`

---

## Current scope

This plugin is currently **cron-first** by design.

**What is implemented today:**
- cron task-health health detection
- webhook / main-session / email actions

**What is not implemented yet:**
- ACP detection
- subagent detection
- CLI task-health detection

The model/config supports additional runtimes:

- `cron`
- `acp`
- `subagent`
- `cli`

But the active health detector is intentionally focused on cron as the first production slice.

---

## Notes

For implementation history and any remaining follow-ups, see:

- `plans/task-health-implementation-plan.md`
- `plans/deviations-log.md`
