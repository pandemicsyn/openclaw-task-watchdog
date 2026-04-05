import { describe, expect, it } from "vitest";

import { evaluateAlertRules } from "../src/rule-engine.js";
import type {
  DetachedWorkAlertAction,
  DetachedWorkAlertEvent,
  DetachedWorkAlertRule,
  DetachedWorkHealthState,
} from "../src/types.js";

const NOW = Date.UTC(2026, 3, 5, 6, 0, 0);

function event(overrides: Partial<DetachedWorkAlertEvent>): DetachedWorkAlertEvent {
  return {
    id: "event-1",
    eventType: "task_failed",
    severity: "warning",
    runtime: "cron",
    taskId: "task-1",
    title: "Detached Work Health task_failed",
    summary: "cron task failed",
    createdAt: NOW,
    task: {
      status: "failed",
      deliveryStatus: "delivered",
    },
    ...overrides,
  };
}

const rules: DetachedWorkAlertRule[] = [
  {
    id: "rule-1",
    eventTypes: ["task_failed", "task_timed_out"],
    runtimes: ["cron"],
    minSeverity: "warning",
    actionIds: ["webhook-1", "prompt-1"],
    cooldownMinutes: 10,
  },
];

const actions: DetachedWorkAlertAction[] = [
  { id: "webhook-1", kind: "webhook", url: "https://example.test/hook" },
  { id: "prompt-1", kind: "main_session_prompt" },
  { id: "email-1", kind: "email", provider: "resend", to: ["ops@example.com"] },
];

describe("evaluateAlertRules", () => {
  it("matches rules and emits one decision per action id", () => {
    const out = evaluateAlertRules({
      events: [event({ id: "event-a" })],
      rules,
      actions,
      now: NOW,
    });

    expect(out.decisions).toHaveLength(2);
    expect(out.decisions.map((d) => d.decision.actionId).sort()).toEqual(["prompt-1", "webhook-1"]);
  });

  it("enforces cooldown dedupe", () => {
    const previousState: DetachedWorkHealthState = {
      dedupe: {
        "rule-1|webhook-1|cron|task_failed|task-1|": NOW * 10 + 2,
        "rule-1|prompt-1|cron|task_failed|task-1|": NOW * 10 + 2,
      },
      lastSeenTaskStateByTaskKey: {},
      recentIncidents: [],
    };

    const out = evaluateAlertRules({
      events: [event({ id: "event-b" })],
      rules,
      actions,
      now: NOW + 5 * 60_000,
      previousState,
    });

    expect(out.decisions).toHaveLength(0);
  });

  it("allows escalation to critical inside cooldown", () => {
    const previousState: DetachedWorkHealthState = {
      dedupe: {
        "rule-1|webhook-1|cron|task_failed|task-1|": NOW * 10 + 2,
      },
      lastSeenTaskStateByTaskKey: {},
      recentIncidents: [],
    };

    const out = evaluateAlertRules({
      events: [event({ id: "event-c", severity: "critical" })],
      rules,
      actions,
      now: NOW + 2 * 60_000,
      previousState,
    });

    expect(out.decisions.map((d) => d.decision.actionId)).toContain("webhook-1");
  });
});
