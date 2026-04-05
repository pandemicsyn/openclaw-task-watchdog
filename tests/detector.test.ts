import { describe, expect, it } from "vitest";

import { detectTaskHealth } from "../src/detector.js";
import type { TaskHealthTaskRun } from "../src/types.js";

const NOW = Date.UTC(2026, 3, 5, 5, 0, 0);

function baseRun(overrides: Partial<TaskHealthTaskRun>): TaskHealthTaskRun {
  const run: TaskHealthTaskRun = {
    taskId: "task-1",
    runtime: "cron",
    status: "succeeded",
    deliveryStatus: "delivered",
    startedAt: NOW - 30_000,
    endedAt: NOW - 10_000,
  };

  if (typeof overrides.taskId === "string") run.taskId = overrides.taskId;
  if (typeof overrides.runtime === "string") run.runtime = overrides.runtime;
  if (typeof overrides.status === "string") run.status = overrides.status;
  if (typeof overrides.deliveryStatus === "string") {
    run.deliveryStatus = overrides.deliveryStatus;
  }
  if (typeof overrides.startedAt === "number") run.startedAt = overrides.startedAt;
  if (typeof overrides.endedAt === "number") run.endedAt = overrides.endedAt;
  if (typeof overrides.label === "string") run.label = overrides.label;
  if (typeof overrides.sourceId === "string") run.sourceId = overrides.sourceId;
  if (typeof overrides.runId === "string") run.runId = overrides.runId;
  if (typeof overrides.detail === "string") run.detail = overrides.detail;

  return run;
}

describe("detectTaskHealth", () => {
  it("emits failed/timed_out/lost/delivery_failed transition events", () => {
    const runs: TaskHealthTaskRun[] = [
      baseRun({ taskId: "a", status: "failed", deliveryStatus: "delivered" }),
      baseRun({ taskId: "b", status: "timed_out", deliveryStatus: "delivered" }),
      baseRun({ taskId: "c", status: "lost", deliveryStatus: "delivered" }),
      baseRun({ taskId: "d", status: "succeeded", deliveryStatus: "failed" }),
    ];

    const result = detectTaskHealth({ runs, now: NOW });
    const types = result.events.map((e) => e.eventType);

    expect(types).toContain("task_failed");
    expect(types).toContain("task_timed_out");
    expect(types).toContain("task_lost");
    expect(types).toContain("delivery_failed");
    expect(result.snapshot.overall).toBe("critical");
  });

  it("emits stale_running with warning and critical levels by threshold", () => {
    const warningRun = baseRun({
      taskId: "warning",
      status: "running",
      startedAt: NOW - 11 * 60_000,
    });
    delete warningRun.endedAt;

    const criticalRun = baseRun({
      taskId: "critical",
      status: "running",
      startedAt: NOW - 21 * 60_000,
    });
    delete criticalRun.endedAt;

    const result = detectTaskHealth({ runs: [warningRun, criticalRun], now: NOW });
    const staleEvents = result.events.filter((e) => e.eventType === "task_stale_running");

    expect(staleEvents).toHaveLength(2);
    expect(staleEvents.find((e) => e.taskId === "warning")?.severity).toBe("warning");
    expect(staleEvents.find((e) => e.taskId === "critical")?.severity).toBe("critical");
  });

  it("does not re-emit transition events when state has not changed", () => {
    const run = baseRun({
      taskId: "same",
      status: "failed",
      deliveryStatus: "failed",
      runId: "r1",
    });

    const first = detectTaskHealth({ runs: [run], now: NOW });
    const second = detectTaskHealth({
      runs: [run],
      now: NOW + 60_000,
      previousState: first.nextState,
    });

    const secondTypes = second.events.map((e) => e.eventType);
    expect(secondTypes).not.toContain("task_failed");
    expect(secondTypes).not.toContain("delivery_failed");
  });

  it("tracks task state by taskId+runId", () => {
    const first = detectTaskHealth({
      runs: [baseRun({ taskId: "same", runId: "r1", status: "failed" })],
      now: NOW,
    });

    const second = detectTaskHealth({
      runs: [baseRun({ taskId: "same", runId: "r2", status: "failed" })],
      now: NOW + 60_000,
      previousState: first.nextState,
    });

    expect(second.events.map((e) => e.eventType)).toContain("task_failed");
  });

  it("emits failure_streak and recovered", () => {
    const failedRuns: TaskHealthTaskRun[] = [
      baseRun({ taskId: "s1", status: "failed", endedAt: NOW - 10_000 }),
      baseRun({ taskId: "s2", status: "failed", endedAt: NOW - 20_000 }),
      baseRun({ taskId: "s3", status: "failed", endedAt: NOW - 30_000 }),
    ];
    const first = detectTaskHealth({ runs: failedRuns, now: NOW });
    expect(first.events.map((e) => e.eventType)).toContain("failure_streak");

    const recovered = detectTaskHealth({
      runs: [baseRun({ taskId: "ok", status: "succeeded", deliveryStatus: "delivered" })],
      now: NOW + 60_000,
      previousState: first.nextState,
    });
    expect(recovered.events.map((e) => e.eventType)).toContain("recovered");
  });

  it("ignores non-cron runs in milestone 1", () => {
    const run = baseRun({ runtime: "acp", status: "failed" });
    const result = detectTaskHealth({ runs: [run], now: NOW });

    expect(result.events).toHaveLength(0);
    expect(result.snapshot.runtimes[0]?.runtime).toBe("cron");
  });
});
