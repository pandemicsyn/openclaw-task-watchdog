# Detached Work Health — Deviations & Deferrals Log

Tracks deviations from `plans/detached-work-health-implementation-plan.md` during implementation.

## Phase 0 — foundation

### Deviations

1. **State shape continuity retained from early commits**
   - `dedupe` remains `Record<string, number>` with encoded timestamp+severity for compatibility with existing state.
   - Follow-up: migrate to explicit object state with versioning when persistence layer is added.

## Phase 1 — cron-first detector

### Deviations

1. **Transition detection key uses `taskId` only (not `taskId + runId`)**
   - Keeps state minimal in current implementation.
   - Follow-up: tighten to run-level transition tracking when run identity guarantees are wired.

3. **Cron-first detector is intentionally runtime-scoped even though plugin surfaces are runtime-aware**
   - Native runtime ingestion now uses OpenClaw task runtime APIs.
   - Detection remains cron-first by product scope, not by adapter limitation.

2. **Stale-running emits per detector pass once threshold is met**
   - Suppression is handled by rule cooldown in Phase 2.

## Phase 2 — actions

### Deviations

1. **Webhook signing currently forwards configured static secret header**
   - No HMAC body-signing yet.
   - Follow-up: add canonical signed payload format if required by consumers.

### Deferrals

1. **Retry/backoff policy for transient webhook/provider errors**
   - Deferred to reliability hardening pass.

2. **State versioning + migration helpers**
   - Deferred to persistence/storage phase.
