import { getThresholds } from "./config.js";
import type {
  DetachedWorkAlertEvent,
  DetachedWorkDetectorInput,
  DetachedWorkDetectorOutput,
  DetachedWorkHealthState,
  DetachedWorkRuntime,
  DetachedWorkRuntimeHealthSnapshot,
  DetachedWorkTaskRun,
} from "./types.js";

const CRON_RUNTIME: DetachedWorkRuntime = "cron";

function taskKey(run: DetachedWorkTaskRun): string {
  return `${run.taskId}|${run.runId ?? ""}`;
}

function makeStateKey(run: DetachedWorkTaskRun): string {
  return `${run.status}|${run.deliveryStatus}`;
}

function elapsedMs(run: DetachedWorkTaskRun, now: number): number | undefined {
  if (!run.startedAt) return undefined;
  const end = run.endedAt ?? now;
  return Math.max(0, end - run.startedAt);
}

function eventId(parts: Record<string, string | number | undefined>): string {
  return Object.entries(parts)
    .map(([k, v]) => `${k}:${String(v ?? "")}`)
    .join("|");
}

function createEvent(
  run: DetachedWorkTaskRun,
  now: number,
  eventType: DetachedWorkAlertEvent["eventType"],
  severity: DetachedWorkAlertEvent["severity"],
  summary: string,
): DetachedWorkAlertEvent {
  const ms = elapsedMs(run, now);

  const task: DetachedWorkAlertEvent["task"] = {
    status: run.status,
    deliveryStatus: run.deliveryStatus,
    ...(typeof run.startedAt === "number" ? { startedAt: run.startedAt } : {}),
    ...(typeof run.endedAt === "number" ? { endedAt: run.endedAt } : {}),
    ...(typeof ms === "number" ? { elapsedMs: ms } : {}),
    ...(typeof run.label === "string" ? { label: run.label } : {}),
  };

  return {
    id: eventId({
      taskId: run.taskId,
      runId: run.runId,
      eventType,
      at: now,
    }),
    eventType,
    severity,
    runtime: run.runtime,
    taskId: run.taskId,
    ...(typeof run.sourceId === "string" ? { sourceId: run.sourceId } : {}),
    ...(typeof run.runId === "string" ? { runId: run.runId } : {}),
    title: `Detached Work Health ${eventType}`,
    summary,
    ...(typeof run.detail === "string" ? { detail: run.detail } : {}),
    createdAt: now,
    task,
  };
}

function runtimeHealthLevel(
  s: DetachedWorkRuntimeHealthSnapshot,
): "healthy" | "warning" | "critical" {
  if (s.recentTimedOut > 0 || s.recentLost > 0) return "critical";
  if (
    s.recentFailures > 0 ||
    s.recentDeliveryFailures > 0 ||
    s.staleRunning > 0 ||
    s.failureStreaks > 0
  ) {
    return "warning";
  }
  return "healthy";
}

function recentIncidents(
  previousState: DetachedWorkHealthState,
  events: DetachedWorkAlertEvent[],
  limit: number,
): DetachedWorkAlertEvent[] {
  const merged = [...events, ...previousState.recentIncidents];
  const deduped = new Map<string, DetachedWorkAlertEvent>();
  for (const event of merged) {
    if (!deduped.has(event.id)) deduped.set(event.id, event);
  }
  return [...deduped.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export function detectDetachedWorkHealth(
  input: DetachedWorkDetectorInput,
): DetachedWorkDetectorOutput {
  const now = input.now ?? Date.now();
  const previousState: DetachedWorkHealthState = input.previousState ?? {
    dedupe: {},
    lastSeenTaskStateByTaskKey: {},
    recentIncidents: [],
  };

  const runs = input.runs.filter((run) => run.runtime === CRON_RUNTIME);
  const nextLastSeen = { ...previousState.lastSeenTaskStateByTaskKey };
  const events: DetachedWorkAlertEvent[] = [];

  const thresholds = getThresholds(CRON_RUNTIME, input.thresholdsByRuntime);
  const staleRunningMs = thresholds.staleRunningMinutes * 60_000;
  const criticalRunningMs = thresholds.criticalRunningMinutes * 60_000;
  const lookbackStart = now - thresholds.lookbackMinutes * 60_000;

  for (const run of runs) {
    const key = taskKey(run);
    const current = makeStateKey(run);
    const previous = previousState.lastSeenTaskStateByTaskKey[key];
    const transitioned = current !== previous;

    if (transitioned && run.status === "failed") {
      events.push(
        createEvent(
          run,
          now,
          "task_failed",
          "warning",
          `cron task${run.label ? ` \"${run.label}\"` : ""} failed`,
        ),
      );
    }

    if (transitioned && run.status === "timed_out") {
      events.push(
        createEvent(
          run,
          now,
          "task_timed_out",
          "critical",
          `cron task${run.label ? ` \"${run.label}\"` : ""} timed out`,
        ),
      );
    }

    if (transitioned && run.status === "lost") {
      events.push(
        createEvent(
          run,
          now,
          "task_lost",
          "critical",
          `cron task${run.label ? ` \"${run.label}\"` : ""} became lost`,
        ),
      );
    }

    const ms = elapsedMs(run, now);
    if (run.status === "running" && typeof ms === "number" && ms >= staleRunningMs) {
      events.push(
        createEvent(
          run,
          now,
          "task_stale_running",
          ms >= criticalRunningMs ? "critical" : "warning",
          `cron task${run.label ? ` \"${run.label}\"` : ""} running for ${Math.floor(ms / 60_000)}m`,
        ),
      );
    }

    if (transitioned && run.deliveryStatus === "failed") {
      events.push(
        createEvent(
          run,
          now,
          "delivery_failed",
          "warning",
          `cron delivery failed${run.label ? ` for \"${run.label}\"` : ""}`,
        ),
      );
    }

    nextLastSeen[key] = current;
  }

  const failedInWindow = runs.filter((run) => {
    const terminalAt = run.endedAt ?? run.startedAt ?? 0;
    return run.status === "failed" && terminalAt >= lookbackStart;
  });
  if (failedInWindow.length >= thresholds.failureStreakCount) {
    const latest = failedInWindow[0]!;
    events.push(
      createEvent(
        latest,
        now,
        "failure_streak",
        "warning",
        `cron failure streak reached ${failedInWindow.length} within ${thresholds.lookbackMinutes}m`,
      ),
    );
  }

  const previousFailures = previousState.recentIncidents.filter(
    (event) =>
      event.runtime === CRON_RUNTIME &&
      ["task_failed", "task_timed_out", "task_lost", "failure_streak"].includes(event.eventType),
  );
  const currentlyHealthyTerminal = runs.some(
    (run) => run.status === "succeeded" && run.deliveryStatus !== "failed",
  );
  if (previousFailures.length > 0 && currentlyHealthyTerminal) {
    const latest = runs.find((run) => run.status === "succeeded") ?? runs[0];
    if (latest) {
      events.push(
        createEvent(
          latest,
          now,
          "recovered",
          "info",
          `cron health recovered after previous failures`,
        ),
      );
    }
  }

  const incidents = recentIncidents(previousState, events, input.recentNotableLimit ?? 20);
  const runtimeSnapshot: DetachedWorkRuntimeHealthSnapshot = {
    runtime: CRON_RUNTIME,
    health: "healthy",
    active: runs.filter((run) => run.status === "running").length,
    recentFailures: incidents.filter((e) => e.eventType === "task_failed").length,
    recentTimedOut: incidents.filter((e) => e.eventType === "task_timed_out").length,
    recentLost: incidents.filter((e) => e.eventType === "task_lost").length,
    recentDeliveryFailures: incidents.filter((e) => e.eventType === "delivery_failed").length,
    staleRunning: incidents.filter((e) => e.eventType === "task_stale_running").length,
    failureStreaks: incidents.filter((e) => e.eventType === "failure_streak").length,
    latestNotableRuns: incidents,
  };
  runtimeSnapshot.health = runtimeHealthLevel(runtimeSnapshot);

  const snapshot = {
    overall: runtimeSnapshot.health,
    generatedAt: now,
    runtimes: [runtimeSnapshot],
  };

  return {
    events,
    snapshot,
    nextState: {
      ...previousState,
      lastSeenTaskStateByTaskKey: nextLastSeen,
      recentIncidents: incidents,
    },
  };
}
