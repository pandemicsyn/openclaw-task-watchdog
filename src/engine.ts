import { DefaultTaskHealthActionExecutor } from "./action-executor.js";
import { parseTaskHealthConfig, type TaskHealthConfigInput } from "./config-schema.js";
import { detectTaskHealth } from "./detector.js";
import { ProviderBackedEmailSender } from "./email.js";
import { evaluateAlertRules } from "./rule-engine.js";
import { SystemEventMainSessionPublisher, type MainSessionEventSender } from "./main-session.js";
import { FetchWebhookClient } from "./webhook.js";

import type {
  TaskHealthActionExecutionResult,
  TaskHealthAlertEvent,
  TaskHealthDetectorOutput,
  TaskHealthState,
  TaskHealthTaskRun,
} from "./types.js";

export type TaskHealthActionEngineInput = {
  detector: TaskHealthDetectorOutput;
  config: TaskHealthConfigInput;
  previousState?: TaskHealthState;
  now?: number;
  mainSessionSystemEvent: MainSessionEventSender;
};

export type TaskHealthActionEngineOutput = {
  events: TaskHealthAlertEvent[];
  results: TaskHealthActionExecutionResult[];
  nextState: TaskHealthState;
};

export type TaskHealthPipelineInput = {
  runs: TaskHealthTaskRun[];
  config: TaskHealthConfigInput;
  previousState?: TaskHealthState;
  now?: number;
  mainSessionSystemEvent: MainSessionEventSender;
};

export type TaskHealthPipelineOutput = {
  detector: TaskHealthDetectorOutput;
  actions: TaskHealthActionEngineOutput;
};

export async function processAlertActions(
  input: TaskHealthActionEngineInput,
): Promise<TaskHealthActionEngineOutput> {
  const now = input.now ?? Date.now();
  const config = parseTaskHealthConfig(input.config);

  const rules = config.rules.map((rule) => ({
    id: rule.id,
    eventTypes: rule.eventTypes,
    actionIds: rule.actionIds,
    ...(typeof rule.enabled === "boolean" ? { enabled: rule.enabled } : {}),
    ...(rule.runtimes ? { runtimes: rule.runtimes } : {}),
    ...(rule.minSeverity ? { minSeverity: rule.minSeverity } : {}),
    ...(typeof rule.cooldownMinutes === "number" ? { cooldownMinutes: rule.cooldownMinutes } : {}),
  }));

  const actions = config.actions.map((action) => {
    if (action.kind === "webhook") {
      return {
        id: action.id,
        kind: "webhook" as const,
        url: action.url,
        ...(typeof action.enabled === "boolean" ? { enabled: action.enabled } : {}),
        ...(typeof action.secret === "string" ? { secret: action.secret } : {}),
        ...(action.headers ? { headers: action.headers } : {}),
        ...(typeof action.timeoutMs === "number" ? { timeoutMs: action.timeoutMs } : {}),
        ...(typeof action.retryCount === "number" ? { retryCount: action.retryCount } : {}),
      };
    }

    if (action.kind === "email") {
      return {
        id: action.id,
        kind: "email" as const,
        provider: action.provider,
        to: action.to,
        ...(typeof action.enabled === "boolean" ? { enabled: action.enabled } : {}),
        ...(typeof action.from === "string" ? { from: action.from } : {}),
        ...(typeof action.subjectPrefix === "string"
          ? { subjectPrefix: action.subjectPrefix }
          : {}),
        ...(typeof action.retryCount === "number" ? { retryCount: action.retryCount } : {}),
      };
    }

    return {
      id: action.id,
      kind: "main_session_prompt" as const,
      ...(typeof action.enabled === "boolean" ? { enabled: action.enabled } : {}),
      ...(action.wakeMode ? { wakeMode: action.wakeMode } : {}),
      ...(typeof action.prefix === "string" ? { prefix: action.prefix } : {}),
    };
  });

  const providerConfig = {
    ...(config.emailProviders?.resend
      ? {
          resend: {
            apiKey: config.emailProviders.resend.apiKey,
            defaultFrom: config.emailProviders.resend.defaultFrom,
          },
        }
      : {}),
    ...(config.emailProviders?.nodemailer
      ? {
          nodemailer: {
            host: config.emailProviders.nodemailer.host,
            port: config.emailProviders.nodemailer.port,
            defaultFrom: config.emailProviders.nodemailer.defaultFrom,
            ...(typeof config.emailProviders.nodemailer.secure === "boolean"
              ? { secure: config.emailProviders.nodemailer.secure }
              : {}),
            ...(typeof config.emailProviders.nodemailer.user === "string"
              ? { user: config.emailProviders.nodemailer.user }
              : {}),
            ...(typeof config.emailProviders.nodemailer.pass === "string"
              ? { pass: config.emailProviders.nodemailer.pass }
              : {}),
          },
        }
      : {}),
  };

  const ruleStateBase: TaskHealthState = {
    ...(input.previousState ?? input.detector.nextState),
    ...(input.detector.nextState ?? {}),
    dedupe: {
      ...(input.previousState?.dedupe ?? {}),
      ...(input.detector.nextState?.dedupe ?? {}),
    },
    lastSeenTaskStateByTaskKey: {
      ...(input.previousState?.lastSeenTaskStateByTaskKey ?? {}),
      ...(input.detector.nextState?.lastSeenTaskStateByTaskKey ?? {}),
    },
    recentIncidents: [
      ...(input.detector.nextState?.recentIncidents ?? []),
      ...(input.previousState?.recentIncidents ?? []),
    ]
      .filter((event, index, arr) => arr.findIndex((other) => other.id == event.id) === index)
      .slice(0, 20),
  };

  const evaluated = evaluateAlertRules({
    events: input.detector.events,
    rules,
    actions,
    now,
    previousState: ruleStateBase,
  });

  const executor = new DefaultTaskHealthActionExecutor(
    new FetchWebhookClient(),
    new ProviderBackedEmailSender(providerConfig),
    new SystemEventMainSessionPublisher(input.mainSessionSystemEvent),
  );

  const results: TaskHealthActionExecutionResult[] = [];
  for (const pending of evaluated.decisions) {
    const result = await executor.execute(pending.action, pending.event, pending.decision);
    results.push(result);
  }

  return {
    events: input.detector.events,
    results,
    nextState: evaluated.nextState,
  };
}

export async function runTaskHealthPipeline(
  input: TaskHealthPipelineInput,
): Promise<TaskHealthPipelineOutput> {
  const config = parseTaskHealthConfig(input.config);

  const normalizeThreshold = (v: {
    staleRunningMinutes?: number | undefined;
    criticalRunningMinutes?: number | undefined;
    failureStreakCount?: number | undefined;
    lookbackMinutes?: number | undefined;
  }) => ({
    ...(typeof v.staleRunningMinutes === "number"
      ? { staleRunningMinutes: v.staleRunningMinutes }
      : {}),
    ...(typeof v.criticalRunningMinutes === "number"
      ? { criticalRunningMinutes: v.criticalRunningMinutes }
      : {}),
    ...(typeof v.failureStreakCount === "number"
      ? { failureStreakCount: v.failureStreakCount }
      : {}),
    ...(typeof v.lookbackMinutes === "number" ? { lookbackMinutes: v.lookbackMinutes } : {}),
  });

  const thresholdsByRuntime = config.thresholdsByRuntime
    ? {
        ...(config.thresholdsByRuntime.cron
          ? { cron: normalizeThreshold(config.thresholdsByRuntime.cron) }
          : {}),
        ...(config.thresholdsByRuntime.acp
          ? { acp: normalizeThreshold(config.thresholdsByRuntime.acp) }
          : {}),
        ...(config.thresholdsByRuntime.subagent
          ? { subagent: normalizeThreshold(config.thresholdsByRuntime.subagent) }
          : {}),
        ...(config.thresholdsByRuntime.cli
          ? { cli: normalizeThreshold(config.thresholdsByRuntime.cli) }
          : {}),
      }
    : undefined;

  const detector = detectTaskHealth({
    runs: input.runs,
    ...(typeof input.now === "number" ? { now: input.now } : {}),
    ...(input.previousState ? { previousState: input.previousState } : {}),
    ...(thresholdsByRuntime ? { thresholdsByRuntime } : {}),
  });

  const actions = await processAlertActions({
    detector,
    config,
    ...(input.previousState ? { previousState: input.previousState } : {}),
    ...(typeof input.now === "number" ? { now: input.now } : {}),
    mainSessionSystemEvent: input.mainSessionSystemEvent,
  });

  return { detector, actions };
}
