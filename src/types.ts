export type TaskHealthRuntime = "cron" | "acp" | "subagent" | "cli";

export type TaskHealthSeverity = "info" | "warning" | "critical";

export type TaskHealthEventType =
  | "task_failed"
  | "task_timed_out"
  | "task_lost"
  | "task_stale_running"
  | "delivery_failed"
  | "failure_streak"
  | "recovered";

export type TaskHealthTaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "lost"
  | "cancelled";

export type TaskHealthDeliveryStatus =
  | "pending"
  | "delivered"
  | "session_queued"
  | "failed"
  | "parent_missing"
  | "not_applicable";

export type TaskHealthTaskRun = {
  taskId: string;
  runtime: TaskHealthRuntime;
  status: TaskHealthTaskStatus;
  deliveryStatus: TaskHealthDeliveryStatus;
  startedAt?: number;
  endedAt?: number;
  label?: string;
  sourceId?: string;
  runId?: string;
  detail?: string;
};

export type TaskHealthAlertEvent = {
  id: string;
  eventType: TaskHealthEventType;
  severity: TaskHealthSeverity;
  runtime: TaskHealthRuntime;
  taskId: string;
  sourceId?: string;
  runId?: string;
  title: string;
  summary: string;
  detail?: string;
  createdAt: number;
  task: {
    status: TaskHealthTaskStatus;
    deliveryStatus: TaskHealthDeliveryStatus;
    startedAt?: number;
    endedAt?: number;
    elapsedMs?: number;
    label?: string;
  };
  metadata?: Record<string, unknown>;
};

export type TaskHealthThresholdConfig = {
  staleRunningMinutes?: number;
  criticalRunningMinutes?: number;
  failureStreakCount?: number;
  lookbackMinutes?: number;
};

export type TaskHealthThresholdsByRuntime = Partial<
  Record<TaskHealthRuntime, TaskHealthThresholdConfig>
>;

export type TaskHealthRuntimeHealthSnapshot = {
  runtime: TaskHealthRuntime;
  health: "healthy" | "warning" | "critical";
  active: number;
  recentFailures: number;
  recentTimedOut: number;
  recentLost: number;
  recentDeliveryFailures: number;
  staleRunning: number;
  failureStreaks: number;
  latestNotableRuns: TaskHealthAlertEvent[];
};

export type TaskHealthSnapshot = {
  overall: "healthy" | "warning" | "critical";
  generatedAt: number;
  runtimes: TaskHealthRuntimeHealthSnapshot[];
};

export type TaskHealthState = {
  dedupe: Record<string, number>;
  lastSeenTaskStateByTaskKey: Record<string, string>;
  recentIncidents: TaskHealthAlertEvent[];
  runtimeHealthCache?: Record<string, unknown>;
};

export type TaskHealthDetectorInput = {
  runs: TaskHealthTaskRun[];
  now?: number;
  previousState?: TaskHealthState;
  thresholdsByRuntime?: TaskHealthThresholdsByRuntime;
  recentNotableLimit?: number;
};

export type TaskHealthDetectorOutput = {
  events: TaskHealthAlertEvent[];
  snapshot: TaskHealthSnapshot;
  nextState: TaskHealthState;
};

export type TaskHealthAlertRule = {
  id: string;
  enabled?: boolean;
  eventTypes: TaskHealthEventType[];
  runtimes?: TaskHealthRuntime[];
  minSeverity?: TaskHealthSeverity;
  actionIds: string[];
  cooldownMinutes?: number;
};

export type TaskHealthAlertAction =
  | {
      id: string;
      kind: "webhook";
      enabled?: boolean;
      url: string;
      secret?: string;
      headers?: Record<string, string>;
      timeoutMs?: number;
      retryCount?: number;
    }
  | {
      id: string;
      kind: "email";
      enabled?: boolean;
      provider: "resend" | "nodemailer";
      to: string[];
      from?: string;
      subjectPrefix?: string;
      retryCount?: number;
    }
  | {
      id: string;
      kind: "main_session_prompt";
      enabled?: boolean;
      wakeMode?: "now" | "next-heartbeat";
      prefix?: string;
    };

export type TaskHealthRulesConfig = {
  rules: TaskHealthAlertRule[];
  actions: TaskHealthAlertAction[];
};

export type TaskHealthRuleDecision = {
  ruleId: string;
  actionId: string;
  eventId: string;
};

export type TaskHealthActionExecutionSuccess = {
  ok: true;
  actionId: string;
  decision: TaskHealthRuleDecision;
};

export type TaskHealthActionExecutionFailure = {
  ok: false;
  actionId: string;
  decision: TaskHealthRuleDecision;
  error: string;
};

export type TaskHealthActionExecutionResult =
  | TaskHealthActionExecutionSuccess
  | TaskHealthActionExecutionFailure;

export interface TaskHealthActionExecutor {
  execute(
    action: TaskHealthAlertAction,
    event: TaskHealthAlertEvent,
    decision: TaskHealthRuleDecision,
  ): Promise<TaskHealthActionExecutionResult>;
}

export type TaskHealthMainSessionPublisherInput = {
  text: string;
  wakeMode: "now" | "next-heartbeat";
};

export interface TaskHealthMainSessionPublisher {
  publish(input: TaskHealthMainSessionPublisherInput): Promise<void>;
}

export type TaskHealthWebhookRequest = {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs?: number;
};

export interface TaskHealthWebhookClient {
  post(request: TaskHealthWebhookRequest): Promise<void>;
}

export interface TaskHealthEmailSender {
  send(input: {
    provider: "resend" | "nodemailer";
    to: string[];
    from?: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void>;
}

export type TaskHealthRuleEngineInput = {
  events: TaskHealthAlertEvent[];
  rules: TaskHealthAlertRule[];
  actions: TaskHealthAlertAction[];
  now?: number;
  previousState?: TaskHealthState;
};

export type TaskHealthRuleEngineOutput = {
  decisions: Array<{
    decision: TaskHealthRuleDecision;
    event: TaskHealthAlertEvent;
    action: TaskHealthAlertAction;
  }>;
  nextState: TaskHealthState;
};
