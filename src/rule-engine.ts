import type {
  TaskHealthAlertAction,
  TaskHealthAlertEvent,
  TaskHealthAlertRule,
  TaskHealthState,
  TaskHealthRuleDecision,
  TaskHealthRuleEngineInput,
  TaskHealthRuleEngineOutput,
  TaskHealthSeverity,
} from "./types.js";

const severityRank: Record<TaskHealthSeverity, number> = {
  info: 1,
  warning: 2,
  critical: 3,
};

function findAction(
  actions: TaskHealthAlertAction[],
  actionId: string,
): TaskHealthAlertAction | undefined {
  return actions.find((action) => action.id === actionId);
}

function eventMatchesRule(event: TaskHealthAlertEvent, rule: TaskHealthAlertRule): boolean {
  if (rule.enabled === false) return false;
  if (!rule.eventTypes.includes(event.eventType)) return false;
  if (rule.runtimes && rule.runtimes.length > 0 && !rule.runtimes.includes(event.runtime)) {
    return false;
  }
  if (rule.minSeverity && severityRank[event.severity] < severityRank[rule.minSeverity]) {
    return false;
  }
  return true;
}

function dedupeKey(ruleId: string, actionId: string, event: TaskHealthAlertEvent): string {
  return [ruleId, actionId, event.runtime, event.eventType, event.taskId, event.runId ?? ""].join(
    "|",
  );
}

function encodeDedupeValue(sentAtMs: number, severity: TaskHealthSeverity): number {
  return sentAtMs * 10 + severityRank[severity];
}

function decodeDedupeValue(value: number): { sentAtMs: number; severity: TaskHealthSeverity } {
  const sev = value % 10;
  const sentAtMs = Math.floor(value / 10);
  if (sev === severityRank.critical) return { sentAtMs, severity: "critical" };
  if (sev === severityRank.warning) return { sentAtMs, severity: "warning" };
  return { sentAtMs, severity: "info" };
}

export function evaluateAlertRules(input: TaskHealthRuleEngineInput): TaskHealthRuleEngineOutput {
  const now = input.now ?? Date.now();
  const previousState: TaskHealthState = input.previousState ?? {
    dedupe: {},
    lastSeenTaskStateByTaskKey: {},
    recentIncidents: [],
  };

  const dedupe = { ...previousState.dedupe };
  const decisions: TaskHealthRuleEngineOutput["decisions"] = [];

  for (const event of input.events) {
    for (const rule of input.rules) {
      if (!eventMatchesRule(event, rule)) continue;

      for (const actionId of rule.actionIds) {
        const action = findAction(input.actions, actionId);
        if (!action || action.enabled === false) continue;

        const key = dedupeKey(rule.id, actionId, event);
        const cooldownMinutes = rule.cooldownMinutes ?? 0;
        const cooldownMs = cooldownMinutes * 60_000;
        const lastSentEncoded = dedupe[key];
        const lastSent =
          typeof lastSentEncoded === "number" ? decodeDedupeValue(lastSentEncoded) : undefined;

        const allowByCooldown =
          !lastSent || cooldownMs <= 0 || now - lastSent.sentAtMs >= cooldownMs;
        const allowByEscalation =
          !!lastSent && severityRank[event.severity] > severityRank[lastSent.severity];

        if (!allowByCooldown && !allowByEscalation) continue;

        const decision: TaskHealthRuleDecision = {
          ruleId: rule.id,
          actionId,
          eventId: event.id,
        };

        decisions.push({ decision, event, action });
        dedupe[key] = encodeDedupeValue(now, event.severity);
      }
    }
  }

  return {
    decisions,
    nextState: {
      ...previousState,
      dedupe,
    },
  };
}
