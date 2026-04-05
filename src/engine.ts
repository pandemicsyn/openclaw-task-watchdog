import { DefaultDetachedWorkActionExecutor } from "./action-executor.js";
import { evaluateAlertRules } from "./rule-engine.js";
import type {
  DetachedWorkActionExecutionResult,
  DetachedWorkAlertAction,
  DetachedWorkAlertEvent,
  DetachedWorkAlertRule,
  DetachedWorkDetectorOutput,
  DetachedWorkEmailSender,
  DetachedWorkHealthState,
  DetachedWorkMainSessionPublisher,
  DetachedWorkWebhookClient,
} from "./types.js";

export type DetachedWorkActionEngineInput = {
  detector: DetachedWorkDetectorOutput;
  rules: DetachedWorkAlertRule[];
  actions: DetachedWorkAlertAction[];
  previousState?: DetachedWorkHealthState;
  now?: number;
  webhookClient: DetachedWorkWebhookClient;
  emailSender: DetachedWorkEmailSender;
  mainSessionPublisher: DetachedWorkMainSessionPublisher;
};

export type DetachedWorkActionEngineOutput = {
  events: DetachedWorkAlertEvent[];
  results: DetachedWorkActionExecutionResult[];
  nextState: DetachedWorkHealthState;
};

export async function processAlertActions(input: DetachedWorkActionEngineInput): Promise<DetachedWorkActionEngineOutput> {
  const now = input.now ?? Date.now();

  const ruleStateBase: DetachedWorkHealthState = {
    ...(input.previousState ?? input.detector.nextState),
    ...(input.detector.nextState ?? {}),
    dedupe: {
      ...(input.previousState?.dedupe ?? {}),
      ...(input.detector.nextState?.dedupe ?? {}),
    },
    lastSeenTaskStateByTaskId: {
      ...(input.previousState?.lastSeenTaskStateByTaskId ?? {}),
      ...(input.detector.nextState?.lastSeenTaskStateByTaskId ?? {}),
    },
  };

  const evaluated = evaluateAlertRules({
    events: input.detector.events,
    rules: input.rules,
    actions: input.actions,
    now,
    previousState: ruleStateBase,
  });

  const executor = new DefaultDetachedWorkActionExecutor(
    input.webhookClient,
    input.emailSender,
    input.mainSessionPublisher,
  );

  const results: DetachedWorkActionExecutionResult[] = [];
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
