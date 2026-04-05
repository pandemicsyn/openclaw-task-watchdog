import { describe, expect, it } from "vitest";

import {
  InMemoryEmailSender,
  InMemoryMainSessionPublisher,
  InMemoryWebhookClient,
} from "../src/action-executor.js";
import { processAlertActions } from "../src/engine.js";
import type {
  DetachedWorkAlertAction,
  DetachedWorkAlertEvent,
  DetachedWorkAlertRule,
  DetachedWorkDetectorOutput,
} from "../src/types.js";

const event: DetachedWorkAlertEvent = {
  id: "event-1",
  eventType: "task_failed",
  severity: "warning",
  runtime: "cron",
  taskId: "task-1",
  title: "Detached Work Health task_failed",
  summary: "cron task failed",
  createdAt: Date.UTC(2026, 3, 5, 7, 0, 0),
  task: {
    status: "failed",
    deliveryStatus: "sent",
  },
};

const detector: DetachedWorkDetectorOutput = {
  events: [event],
  snapshot: {
    overall: "warning",
    generatedAt: event.createdAt,
    runtimes: [
      {
        runtime: "cron",
        health: "warning",
        active: 0,
        recentFailures: 1,
        recentTimedOut: 0,
        recentLost: 0,
        recentDeliveryFailures: 0,
        staleRunning: 0,
        latestNotableRuns: [event],
      },
    ],
  },
  nextState: {
    dedupe: {},
    lastSeenTaskStateByTaskId: {
      "task-1": "failed|sent",
    },
  },
};

const rules: DetachedWorkAlertRule[] = [
  {
    id: "rule-1",
    eventTypes: ["task_failed"],
    actionIds: ["webhook-1", "prompt-1"],
    cooldownMinutes: 10,
  },
];

const actions: DetachedWorkAlertAction[] = [
  { id: "webhook-1", kind: "webhook", url: "https://example.test/hook" },
  { id: "prompt-1", kind: "main_session_prompt", wakeMode: "now" },
];

describe("processAlertActions", () => {
  it("runs rule engine + actions and returns merged next state", async () => {
    const webhooks = new InMemoryWebhookClient();
    const emails = new InMemoryEmailSender();
    const prompts = new InMemoryMainSessionPublisher();

    const output = await processAlertActions({
      detector,
      rules,
      actions,
      webhookClient: webhooks,
      emailSender: emails,
      mainSessionPublisher: prompts,
      now: event.createdAt,
    });

    expect(output.results).toHaveLength(2);
    expect(webhooks.requests).toHaveLength(1);
    expect(prompts.messages).toHaveLength(1);
    expect(output.nextState.dedupe).not.toEqual({});
    expect(output.nextState.lastSeenTaskStateByTaskId["task-1"]).toBe("failed|sent");
  });
});
