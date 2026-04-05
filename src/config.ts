import type {
  TaskHealthRuntime,
  TaskHealthThresholdConfig,
  TaskHealthThresholdsByRuntime,
} from "./types.js";

const DEFAULT_THRESHOLDS: Record<TaskHealthRuntime, TaskHealthThresholdConfig> = {
  cron: {
    staleRunningMinutes: 10,
    criticalRunningMinutes: 20,
    failureStreakCount: 3,
    lookbackMinutes: 60,
  },
  acp: {
    staleRunningMinutes: 30,
    criticalRunningMinutes: 90,
    failureStreakCount: 3,
    lookbackMinutes: 180,
  },
  subagent: {
    staleRunningMinutes: 20,
    criticalRunningMinutes: 60,
    failureStreakCount: 3,
    lookbackMinutes: 120,
  },
  cli: {
    staleRunningMinutes: 15,
    criticalRunningMinutes: 45,
    failureStreakCount: 3,
    lookbackMinutes: 90,
  },
};

export function getThresholds(
  runtime: TaskHealthRuntime,
  overrides?: TaskHealthThresholdsByRuntime,
): Required<TaskHealthThresholdConfig> {
  const merged = {
    ...DEFAULT_THRESHOLDS[runtime],
    ...(overrides?.[runtime] ?? {}),
  };

  return {
    staleRunningMinutes: merged.staleRunningMinutes ?? 10,
    criticalRunningMinutes: merged.criticalRunningMinutes ?? 20,
    failureStreakCount: merged.failureStreakCount ?? 3,
    lookbackMinutes: merged.lookbackMinutes ?? 60,
  };
}
