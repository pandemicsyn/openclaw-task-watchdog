# Detached Work Health — Deviations & Deferrals Log

Tracks deviations from `plans/detached-work-health-implementation-plan.md` during implementation.

## Milestone 1 (Phase 1: cron-first detector)

### Deviations

1. **Transition detection key uses `taskId` only**
   - **Plan intent:** compare task run state transitions.
   - **Implemented:** `lastSeenTaskStateByTaskId[taskId] = "status|deliveryStatus"`.
   - **Why:** keeps state minimal while repo is greenfield.
   - **Impact:** if multiple concurrent runs share a task ID, transition granularity is coarser than run-level (`runId`-level).
   - **Follow-up:** move to `taskId + runId` keyed tracking in Milestone 2/3.

2. **Stale-running alert may repeat each detector pass**
   - **Plan intent:** cooldown/dedupe behavior exists overall.
   - **Implemented:** stale-running events are emitted whenever threshold is met; no cooldown in Milestone 1.
   - **Why:** cooldown/dedupe rule engine is scoped to Phase 2 in plan.
   - **Impact:** downstream consumers must dedupe until rule/action cooldown lands.
   - **Follow-up:** add cooldown and escalation-aware suppression in Milestone 2.

3. **`latestNotableRuns` currently reflects generated events only**
   - **Plan intent:** health snapshot with latest notable runs.
   - **Implemented:** snapshot populates from newly generated event list in current pass.
   - **Why:** no persisted incident/event history store yet.
   - **Impact:** snapshot is pass-local, not historical.
   - **Follow-up:** add persisted recent-incident cache in Milestone 3.

### Deferrals

1. **Rule engine + action execution (webhook/email/main session prompt)**
   - Deferred to Milestone 2 per plan.

2. **Cooldown/dedupe by rule/action incident key**
   - Deferred to Milestone 2 per plan.

3. **Cross-runtime support beyond cron**
   - Deferred to Milestone 4 per plan (code types are runtime-complete, detector enabled only for cron).

4. **Failure streak / recovered events**
   - Deferred to later milestones (V1.5/V2 path per plan).

5. **Recent incident persistence and surface polish**
   - Deferred to Milestone 3.
