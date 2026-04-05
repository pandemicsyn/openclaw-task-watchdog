# Detached Work Health - Implementation Plan

_Repo studied: `openclaw/openclaw`_

**Private gist mirror:** <https://gist.github.com/pandemicsyn/3c64800f830181241b43e9ed7c6a9510>

This document turns the Detached Work Health design into an implementation plan.

The product frame stays the same:

- **cron is the first slice**
- but the architecture is for **detached work health**, not a one-off cron monitor

That matters because the biggest long-term wins are not only scheduled failures. They also include:

- **abnormally long-running ACP jobs**
- **stuck or lost subagents**
- **delivery failures after successful detached work**
- **runtime pressure spikes across detached execution lanes**

So the implementation plan is intentionally shaped to:

1. ship a lightweight cron-first MVP quickly
2. reuse existing public/runtime-supported surfaces where possible
3. support alert actions
4. expand cleanly to ACP/subagents/CLI later

---

## Executive summary

The best first implementation is:

- a plugin-backed **Detached Work Health** subsystem
- using the existing **tasks runtime** as the initial primary signal
- detecting notable health events from detached work task runs
- routing those events through configurable **alert actions**

### First release goals

- focus on `cron`
- detect task failures / timeouts / lost / stale-running
- support configurable actions:
  - **webhook**
  - **email**
  - **main session prompt**
- expose a health snapshot and recent incidents view

### First release non-goals

- deep cron schedule analytics
- full historical metrics engine
- operator-global fleet view beyond current access model
- advanced incident correlation

### Key implementation principle

Use the simplest supported seam first:

- **tasks runtime for execution health**

Then later enrich with:

- cron store
- cron run logs
- broader admin/operator visibility

---

## Product architecture at a glance

The end-state system should look like this:

```text
Detached work signals
  -> health detector
  -> alert/event normalizer
  -> action router
  -> sinks (webhook / email / main-session prompt)
  -> optional health snapshot / digest / UI views
```

For V1, the primary signal source is tasks.

```text
Task runtime (cron first)
  -> runtime filter + health rule evaluation
  -> alert/event creation
  -> action execution
  -> optional state cache / dedupe
```

---

## Existing OpenClaw substrate we should build on

### Tasks subsystem

Already available:

- detached runtime types: `cron`, `acp`, `subagent`, `cli`
- lifecycle statuses
- delivery status
- timestamps
- progress / terminal summaries
- runtime-aware reconciliation
- audit semantics
- plugin-facing task runtime DTOs

### Plugin-facing task runtime

From the earlier research pass, plugins already have a public tasks runtime surface.

That means a plugin can inspect task runs without filesystem spelunking for the initial MVP.

### Session-native notification path

OpenClaw already has native session/system-event concepts.

That makes **main session prompt** a first-class action type, not a hack.

### Existing outbound/send infrastructure

Webhook and outbound messaging concepts already exist elsewhere in OpenClaw. Detached Work Health should align with those patterns rather than inventing a bespoke notification universe.

---

## Scope: what V1 implements

## V1 runtime scope

Support health detection for:

- `cron`

Design the code so other runtimes are enum-complete and structurally supported, but disabled or inactive by default.

## V1 alertable conditions

At minimum:

- `task_failed`
- `task_timed_out`
- `task_lost`
- `task_stale_running`
- `delivery_failed`

Optional for V1 if low effort:

- `recovered`
- `failure_streak`

## V1 actions

Ship support for:

- `webhook`
- `email`
- `main_session_prompt`

All three should be configurable and rule-driven.

---

## The alert model

A core design decision:

**alerts should have actions**.

The system should not just compute “health is bad.” It should produce structured alert events that can fan out through multiple configurable actions.

### Separation of concerns

#### Detection layer
Determines:
- what happened
- how severe it is
- which runtime it belongs to

#### Alert layer
Normalizes the event into a stable alert shape.

#### Action layer
Executes one or more configured responses.

That separation gives us:

- reusable actions across multiple rules
- clear policy boundaries
- easier dedupe and cooldown behavior

---

## Proposed domain model

### Runtime

```ts
type DetachedWorkRuntime = "cron" | "acp" | "subagent" | "cli";
```

### Severity

```ts
type DetachedWorkSeverity = "info" | "warning" | "critical";
```

### Event type

```ts
type DetachedWorkEventType =
  | "task_failed"
  | "task_timed_out"
  | "task_lost"
  | "task_stale_running"
  | "delivery_failed"
  | "failure_streak"
  | "recovered";
```

### Alert event

```ts
type DetachedWorkAlertEvent = {
  id: string;
  eventType: DetachedWorkEventType;
  severity: DetachedWorkSeverity;
  runtime: DetachedWorkRuntime;
  taskId: string;
  sourceId?: string;
  runId?: string;
  title: string;
  summary: string;
  detail?: string;
  createdAt: number;
  task: {
    status: string;
    deliveryStatus: string;
    startedAt?: number;
    endedAt?: number;
    elapsedMs?: number;
    label?: string;
  };
  metadata?: Record<string, unknown>;
};
```

### Alert rule

```ts
type DetachedWorkAlertRule = {
  id: string;
  enabled?: boolean;
  eventTypes: DetachedWorkEventType[];
  runtimes?: DetachedWorkRuntime[];
  minSeverity?: DetachedWorkSeverity;
  actionIds: string[];
  cooldownMinutes?: number;
};
```

### Alert action

```ts
type DetachedWorkAlertAction =
  | {
      id: string;
      kind: "webhook";
      enabled?: boolean;
      url: string;
      secret?: string;
      headers?: Record<string, string>;
      timeoutMs?: number;
    }
  | {
      id: string;
      kind: "email";
      enabled?: boolean;
      provider: "resend" | "nodemailer";
      to: string[];
      from?: string;
      subjectPrefix?: string;
    }
  | {
      id: string;
      kind: "main_session_prompt";
      enabled?: boolean;
      wakeMode?: "now" | "next-heartbeat";
      prefix?: string;
    };
```

---

## Why these three action types

## 1. Webhook

Best first external sink.

Use cases:
- ops/incident integration
- custom automation
- internal dashboards/pipelines

Good properties:
- simple
- universal
- easy to test
- low product coupling

## 2. Email

Good for:
- daily/overnight summaries
- warning/critical human-readable alerts
- team distro lists

### Rendering stack recommendation

Use:
- **React Email** for rendering templates

Ship provider adapters for:
- **Resend**
- **Nodemailer**

This gives:
- great template ergonomics
- transactional/provider flexibility
- hosted and self-hosted options

## 3. Main session prompt

This is the strongest OpenClaw-native action.

Use cases:
- personal monitoring
- assistant-mediated awareness
- “tell me in my normal OpenClaw lane”

Implementation shape:
- enqueue a system event / prompt to the main session
- wake immediately or next heartbeat

This should be a first-class action, not an afterthought.

---

## Email implementation plan

### Rendering

Use React Email to generate:

- HTML email body
- plain-text fallback

Suggested template types:

- critical alert email
- warning alert email
- digest summary email
- recovery email

### Providers

#### Resend adapter

Config needs:
- API key
- default from address

#### Nodemailer adapter

Config needs:
- SMTP/transport configuration
- default from address

### Provider abstraction

```ts
type DetachedWorkEmailProvider = {
  send(params: {
    to: string[];
    from: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void>;
};
```

The renderer should be independent from the provider adapter.

That keeps email rendering and transport decoupled.

---

## Main session prompt implementation plan

### Behavior

When an alert action of type `main_session_prompt` fires:

- create a concise alert text
- enqueue it as a main-session system event
- optionally wake the main session immediately

### Example output

```text
Detached Work Health alert: cron task "Morning brief" timed out after 12m. Last known detail: job execution timed out.
```

### Why system event is the right seam

Because it:
- stays native to OpenClaw
- lets the main session decide how to present/follow up
- avoids building a parallel internal messaging lane

---

## Health detection engine

## Inputs for V1

Primary input:
- task runs from the public tasks runtime surface

For V1, use:
- bound session/task runtime views
- filter to `runtime === "cron"`

## Core detector responsibilities

Given task runs, determine:

- active tasks
- recent notable events
- health state by runtime
- whether new alert events should be emitted

## Suggested V1 detection rules

### `task_failed`
Emit when:
- task status transitions to `failed`

Severity:
- `warning` by default
- can escalate later if repeated

### `task_timed_out`
Emit when:
- task status transitions to `timed_out`

Severity:
- `critical`

### `task_lost`
Emit when:
- task status transitions to `lost`

Severity:
- `critical`

### `task_stale_running`
Emit when:
- a task remains `running`
- and elapsed time exceeds configured threshold

Severity:
- `warning` at first threshold
- `critical` if it crosses a higher threshold later

### `delivery_failed`
Emit when:
- task delivery status becomes `failed`
- and notify policy is not effectively silent for the operator use case

Severity:
- `warning`

### `failure_streak`
Optional V1/V1.5:
- when multiple failures happen for the same source/runtime within a window

### `recovered`
Optional V1.5/V2:
- emit when a previously degraded runtime/source begins succeeding again

---

## Thresholds and runtime-specific policy

This should be in the design from the start even if only cron uses it initially.

### Proposed config

```ts
type DetachedWorkThresholdConfig = {
  staleRunningMinutes?: number;
  criticalRunningMinutes?: number;
  failureStreakCount?: number;
  lookbackMinutes?: number;
};

type DetachedWorkThresholdsByRuntime = Partial<
  Record<DetachedWorkRuntime, DetachedWorkThresholdConfig>
>;
```

### Initial defaults

#### Cron
- staleRunningMinutes: 10
- criticalRunningMinutes: 20
- failureStreakCount: 3
- lookbackMinutes: 60

#### ACP (future)
- thresholds likely larger than cron

#### Subagent (future)
- thresholds runtime-specific and likely different from ACP

The system should not hardcode a single duration policy for all runtimes.

---

## Dedupe and cooldowns

Without cooldowns, any alerting system becomes a spam cannon.

### Requirements

Each rule/action pair should support cooldown.

Suggested behavior:
- once an alert fires for a matching condition
- suppress repeat sends for the cooldown window
- unless severity escalates

### Suggested cache shape

Persist a small dedupe state in plugin state:

```ts
type DetachedWorkAlertDedupeState = {
  lastSentAtByKey: Record<string, number>;
};
```

Where the dedupe key could include:
- rule id
- action id
- runtime
- task/source identity
- event type

### Escalation rule

If the same logical incident moves from:
- warning -> critical

allow the critical notification even inside cooldown.

---

## Persistence and state

## What the implementation should persist

A lightweight state store should keep:

- last processed task event markers or snapshot identifiers
- alert dedupe/cooldown data
- maybe small incident state for streak/recovery logic

Suggested persisted items:

```ts
type DetachedWorkHealthState = {
  dedupe: Record<string, number>;
  lastSeenTaskStateByTaskId: Record<string, string>;
  runtimeHealthCache?: Record<string, unknown>;
};
```

## Why persist anything at all

So that after restart the system can:
- avoid re-alerting the same old failures immediately
- compare new vs prior task states
- maintain streak/recovery logic

---

## Health snapshot surface

Even if the first ship is alert-centric, the implementation should also expose a health snapshot object.

### Suggested snapshot

```ts
type DetachedWorkRuntimeHealthSnapshot = {
  runtime: DetachedWorkRuntime;
  health: "healthy" | "warning" | "critical";
  active: number;
  recentFailures: number;
  recentTimedOut: number;
  recentLost: number;
  recentDeliveryFailures: number;
  staleRunning: number;
  latestNotableRuns: DetachedWorkAlertEvent[];
};

type DetachedWorkHealthSnapshot = {
  overall: "healthy" | "warning" | "critical";
  generatedAt: number;
  runtimes: DetachedWorkRuntimeHealthSnapshot[];
};
```

This snapshot can later feed:
- UI
- digests
- main-session summaries
- API surfaces

---

## Component breakdown

## 1. Detector

Responsibilities:
- read task runs
- filter by runtime
- detect transitions / notable states
- output alert events + health snapshot

## 2. Rule engine

Responsibilities:
- match alert events against configured rules
- decide which actions should fire
- apply severity/runtime filters
- enforce cooldowns

## 3. Action executor

Responsibilities:
- execute webhook actions
- execute email actions
- execute main session prompt actions
- report success/failure per action

## 4. State store

Responsibilities:
- persist dedupe info
- persist enough prior state for transition detection

## 5. Formatter layer

Responsibilities:
- build webhook payloads
- build email subjects/bodies
- build main-session prompt text

Keep formatting separate from transport.

---

## Webhook payload shape

Suggested payload:

```ts
type DetachedWorkWebhookPayload = {
  version: 1;
  event: DetachedWorkAlertEvent;
  source: {
    product: "openclaw-detached-work-health";
    generatedAt: number;
  };
};
```

### Why keep it small

Webhook consumers want:
- stable schema
- predictable payloads
- no giant blob of internal noise

---

## Email content plan

## Subject examples

- `[Detached Work Health] CRITICAL cron task timed out`
- `[Detached Work Health] WARNING cron delivery failed`
- `[Detached Work Health] RECOVERED cron failures cleared`

## Body contents

For single-event emails:
- severity
- runtime
- task title
- status
- timing
- key error/detail
- source/task ids for debugging

For digests later:
- grouped by runtime
- grouped by severity
- clear counts + top incidents

---

## Main session prompt content plan

Should be:
- concise
- human-readable
- OpenClaw-native
- not overly formatted

Example:

```text
Detached Work Health alert: cron task "Morning brief" failed. Last detail: Discord delivery failed with Forbidden.
```

Optional additions:
- task id/run id for debugging
- severity prefix
- recommendation if obvious

---

## Implementation phases

## Phase 0 - foundation and config

Build:
- config schema
- action types
- rule model
- state store
- event/alert DTOs

Deliverable:
- internal library/code skeleton with tests

## Phase 1 - cron-first detector on tasks runtime

Build:
- task runtime reader
- runtime=`cron` filter
- alert event generation for:
  - failed
  - timed_out
  - lost
  - stale_running
  - delivery_failed
- health snapshot builder

Deliverable:
- cron-focused health engine

## Phase 2 - actions

Build:
- webhook action executor
- main session prompt executor
- email rendering via React Email
- Resend adapter
- Nodemailer adapter
- rule/action matching
- cooldown logic

Deliverable:
- full alert-action path

## Phase 3 - surface and polish

Build:
- snapshot query surface
- recent incidents view
- basic summaries
- tests for alert dedupe and escalation

Deliverable:
- usable MVP product

## Phase 4 - runtime expansion

Add:
- ACP support
- subagent support
- runtime-specific abnormal-duration heuristics

Deliverable:
- detached-work health starts becoming real beyond cron

## Phase 5 - enrichment

Later add:
- cron store integration
- cron run-log enrichment
- richer streak/recovery analytics
- digest emails / periodic summaries

---

## Concrete V1 deliverables

To keep scope honest, V1 should ship with:

- cron-only detection enabled by default
- alert rules/actions config
- webhook action
- main session prompt action
- email action with React Email + Resend + Nodemailer
- health snapshot object
- cooldown/dedupe

If email feels too heavy for the very first cut, it can slide to V1.5, but the model should support it from day one.

---

## Risks and mitigations

### Risk: tasks-only signal is not full cron observability

True.

Mitigation:
- explicitly scope V1 as execution-health-first
- layer in cron store/logs later

### Risk: owner/session-bound access is narrower than operator-global needs

Mitigation:
- scope V1 to the supported access model
- leave room for broader admin surfaces later

### Risk: email provider/config complexity slows launch

Mitigation:
- keep provider adapters thin
- separate rendering from transport
- ship only Resend + Nodemailer initially

### Risk: action spam

Mitigation:
- cooldowns
- dedupe keys
- escalation-aware suppression
- conservative default rules

### Risk: runtime-specific heuristics differ a lot

Mitigation:
- per-runtime threshold config from the start

---

## Success criteria

V1 is successful if a user/operator can:

- detect when cron detached work fails, times out, is lost, or runs abnormally long
- receive alerts through configured actions
- choose between webhook, email, and main-session prompt
- avoid duplicate spam through cooldowns
- understand current cron health from a simple snapshot

The broader product is successful if the same architecture can later support:

- ACP abnormal long-running detection
- subagent stuck/lost monitoring
- cross-runtime detached-work health

without a redesign.

---

## Bottom line

The implementation plan is:

- build **Detached Work Health** as a tasks-driven health engine
- ship **cron first**
- model alerts with **configurable actions**
- support three first-class actions:
  - webhook
  - email
  - main session prompt
- use **React Email** for email rendering
- ship **Resend** and **Nodemailer** adapters by default
- keep the architecture ready for **ACP/subagent abnormal-duration and failure monitoring** next

That gets something useful into the wild fast without trapping the product inside a cron-only box.

---

## Suggested next steps

1. Finalize config schema for rules and actions
2. Implement task-runtime detector for cron events
3. Implement webhook + main-session prompt actions
4. Add React Email renderer and Resend/Nodemailer adapters
5. Add cooldown/dedupe state
6. Ship cron-first MVP
7. Expand to ACP/subagents next
