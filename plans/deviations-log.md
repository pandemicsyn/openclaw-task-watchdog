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

## Milestone 2 (Phase 2: actions)

### Deviations

1. **Email adapter is interface-backed, not provider-SDK-backed yet**
   - **Plan intent:** Resend + Nodemailer adapters.
   - **Implemented:** provider enum and email sender interface (`DetachedWorkEmailSender`) with in-memory test adapter; concrete provider SDK wiring deferred.
   - **Why:** keeps milestone focused on rule/action engine and execution path correctness.
   - **Impact:** integration to real provider APIs is not yet included.
   - **Follow-up:** add concrete Resend/Nodemailer transport adapters in next pass.

2. **Main session prompt action uses publisher interface**
   - **Plan intent:** enqueue native system event / prompt.
   - **Implemented:** `DetachedWorkMainSessionPublisher` abstraction with payload (`text`, `wakeMode`) and in-memory test implementation.
   - **Why:** plugin integration seam not yet finalized in this repo.
   - **Impact:** runtime delivery bridge still needed.
   - **Follow-up:** wire publisher to OpenClaw session system-event API in integration layer.

3. **Dedupe store encoding uses numeric packed value**
   - **Plan intent:** dedupe with escalation awareness.
   - **Implemented:** stored dedupe value packs `sentAt` + severity rank in a single numeric value.
   - **Why:** preserve existing `Record<string, number>` state shape from Milestone 1 without migration.
   - **Impact:** encoding is implicit and should be documented/migrated to explicit object shape later.
   - **Follow-up:** migrate dedupe value to structured object when state versioning lands.

### Deferrals

1. **Concrete webhook delivery hardening (retry/backoff/signature derivation)**
   - Deferred to Milestone 3 polish.

2. **Concrete email providers (Resend/Nodemailer runtime adapters)**
   - Deferred to Milestone 3 (or 2.5) integration pass.

3. **Main-session native transport integration**
   - Deferred to Milestone 3 integration pass.
