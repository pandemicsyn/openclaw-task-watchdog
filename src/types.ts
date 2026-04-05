export type DetachedWorkRuntime = "cron" | "acp" | "subagent" | "cli";

export type DetachedWorkSeverity = "info" | "warning" | "critical";

export type DetachedWorkEventType =
  | "task_failed"
  | "task_timed_out"
  | "task_lost"
  | "task_stale_running"
  | "delivery_failed"
  | "failure_streak"
  | "recovered";

export type DetachedWorkTaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "lost"
  | "cancelled"
  | string;

export type DetachedWorkDeliveryStatus =
  | "pending"
  | "sent"
  | "failed"
  | "none"
  | string;

export type DetachedWorkTaskRun = {
  taskId: string;
  runtime: DetachedWorkRuntime;
  status: DetachedWorkTaskStatus;
  deliveryStatus: DetachedWorkDeliveryStatus;
  startedAt?: number;
  endedAt?: number;
  label?: string;
  sourceId?: string;
  runId?: string;
  detail?: string;
};

export type DetachedWorkAlertEvent = {
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

export type DetachedWorkThresholdConfig = {
  staleRunningMinutes?: number;
  criticalRunningMinutes?: number;
  failureStreakCount?: number;
  lookbackMinutes?: number;
};

export type DetachedWorkThresholdsByRuntime = Partial<
  Record<DetachedWorkRuntime, DetachedWorkThresholdConfig>
>;

export type DetachedWorkRuntimeHealthSnapshot = {
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

export type DetachedWorkHealthSnapshot = {
  overall: "healthy" | "warning" | "critical";
  generatedAt: number;
  runtimes: DetachedWorkRuntimeHealthSnapshot[];
};

export type DetachedWorkHealthState = {
  dedupe: Record<string, number>;
  lastSeenTaskStateByTaskId: Record<string, string>;
  runtimeHealthCache?: Record<string, unknown>;
};

export type DetachedWorkDetectorInput = {
  runs: DetachedWorkTaskRun[];
  now?: number;
  previousState?: DetachedWorkHealthState;
  thresholdsByRuntime?: DetachedWorkThresholdsByRuntime;
  recentNotableLimit?: number;
};

export type DetachedWorkDetectorOutput = {
  events: DetachedWorkAlertEvent[];
  snapshot: DetachedWorkHealthSnapshot;
  nextState: DetachedWorkHealthState;
};
