import { describe, expect, it } from "vitest";

import { processAlertActions, runDetachedWorkPipeline } from "../src/engine.js";
import type { DetachedWorkAlertEvent, DetachedWorkDetectorOutput, DetachedWorkTaskRun } from "../src/types.js";

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

describe("processAlertActions", () => {
  it("runs rule engine + concrete action path and returns merged next state", async () => {
    const sentEvents: Array<{ text: string; mode: "now" | "next-heartbeat" }> = [];

    const output = await processAlertActions({
      detector,
      config: {
        actions: [{ id: "prompt-1", kind: "main_session_prompt", wakeMode: "now" }],
        rules: [
          {
            id: "rule-1",
            eventTypes: ["task_failed"],
            actionIds: ["prompt-1"],
            cooldownMinutes: 10,
          },
        ],
      },
      mainSessionSystemEvent: async (input) => {
        sentEvents.push(input);
      },
      now: event.createdAt,
    });

    expect(output.results).toHaveLength(1);
    expect(output.results[0]?.ok).toBe(true);
    expect(sentEvents).toHaveLength(1);
    expect(output.nextState.dedupe).not.toEqual({});
    expect(output.nextState.lastSeenTaskStateByTaskId["task-1"]).toBe("failed|sent");
  });
});

describe("runDetachedWorkPipeline", () => {
  it("detects cron failure and emits configured prompt action", async () => {
    const sentEvents: Array<{ text: string; mode: "now" | "next-heartbeat" }> = [];
    const now = Date.UTC(2026, 3, 5, 8, 0, 0);

    const runs: DetachedWorkTaskRun[] = [
      {
        taskId: "task-77",
        runtime: "cron",
        status: "failed",
        deliveryStatus: "sent",
        startedAt: now - 60_000,
        endedAt: now - 1_000,
      },
    ];

    const out = await runDetachedWorkPipeline({
      runs,
      config: {
        actions: [{ id: "prompt-1", kind: "main_session_prompt", wakeMode: "now" }],
        rules: [{ id: "rule-1", eventTypes: ["task_failed"], actionIds: ["prompt-1"] }],
      },
      mainSessionSystemEvent: async (input) => {
        sentEvents.push(input);
      },
      now,
    });

    expect(out.detector.events.find((e) => e.eventType === "task_failed")).toBeTruthy();
    expect(out.actions.results).toHaveLength(1);
    expect(sentEvents).toHaveLength(1);
  });
});
