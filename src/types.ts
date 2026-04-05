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

export type DetachedWorkDeliveryStatus = "pending" | "sent" | "failed" | "none" | string;

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

export type DetachedWorkAlertRule = {
  id: string;
  enabled?: boolean;
  eventTypes: DetachedWorkEventType[];
  runtimes?: DetachedWorkRuntime[];
  minSeverity?: DetachedWorkSeverity;
  actionIds: string[];
  cooldownMinutes?: number;
};

export type DetachedWorkAlertAction =
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

export type DetachedWorkRulesConfig = {
  rules: DetachedWorkAlertRule[];
  actions: DetachedWorkAlertAction[];
};

export type DetachedWorkRuleDecision = {
  ruleId: string;
  actionId: string;
  eventId: string;
};

export type DetachedWorkActionExecutionSuccess = {
  ok: true;
  actionId: string;
  decision: DetachedWorkRuleDecision;
};

export type DetachedWorkActionExecutionFailure = {
  ok: false;
  actionId: string;
  decision: DetachedWorkRuleDecision;
  error: string;
};

export type DetachedWorkActionExecutionResult =
  | DetachedWorkActionExecutionSuccess
  | DetachedWorkActionExecutionFailure;

export interface DetachedWorkActionExecutor {
  execute(
    action: DetachedWorkAlertAction,
    event: DetachedWorkAlertEvent,
    decision: DetachedWorkRuleDecision,
  ): Promise<DetachedWorkActionExecutionResult>;
}

export type DetachedWorkMainSessionPublisherInput = {
  text: string;
  wakeMode: "now" | "next-heartbeat";
};

export interface DetachedWorkMainSessionPublisher {
  publish(input: DetachedWorkMainSessionPublisherInput): Promise<void>;
}

export type DetachedWorkWebhookRequest = {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs?: number;
};

export interface DetachedWorkWebhookClient {
  post(request: DetachedWorkWebhookRequest): Promise<void>;
}

export interface DetachedWorkEmailSender {
  send(input: {
    provider: "resend" | "nodemailer";
    to: string[];
    from?: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void>;
}

export type DetachedWorkRuleEngineInput = {
  events: DetachedWorkAlertEvent[];
  rules: DetachedWorkAlertRule[];
  actions: DetachedWorkAlertAction[];
  now?: number;
  previousState?: DetachedWorkHealthState;
};

export type DetachedWorkRuleEngineOutput = {
  decisions: Array<{
    decision: DetachedWorkRuleDecision;
    event: DetachedWorkAlertEvent;
    action: DetachedWorkAlertAction;
  }>;
  nextState: DetachedWorkHealthState;
};
