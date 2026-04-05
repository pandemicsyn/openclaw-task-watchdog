import type { OpenClawPluginApi, OpenClawPluginService } from "openclaw/plugin-sdk/plugin-entry";

import { runTaskHealthPipeline } from "./engine.js";
import { parsePluginConfig } from "./plugin-config.js";
import { fetchTaskRunsFromRuntimeBySession } from "./openclaw-task-source.js";
import { createStateStore } from "./state-store.js";
import { publishMainSessionEvent } from "./system-event-publisher.js";
import type { TaskHealthState } from "./types.js";

export function createTaskWatchdogService(api: OpenClawPluginApi): OpenClawPluginService {
  let timer: NodeJS.Timeout | null = null;
  let isRunning = false;
  let skippedOverlapCount = 0;
  const store = createStateStore(api.runtime.state.resolveStateDir());
  let state: TaskHealthState = {
    dedupe: {},
    lastSeenTaskStateByTaskKey: {},
    recentIncidents: [],
  };

  const runOnce = async (): Promise<void> => {
    if (isRunning) {
      skippedOverlapCount += 1;
      if (skippedOverlapCount === 1 || skippedOverlapCount % 10 === 0) {
        api.logger.warn(
          `task-watchdog: skipped overlapping service tick count=${skippedOverlapCount}`,
        );
      }
      return;
    }

    isRunning = true;
    try {
      const cfg = parsePluginConfig(api.pluginConfig ?? {});
      if (!cfg.enabled) return;

      const runs = fetchTaskRunsFromRuntimeBySession(api.logger, api.runtime, "main");
      const out = await runTaskHealthPipeline({
        runs,
        config: cfg.detachedWork,
        previousState: state,
        mainSessionSystemEvent: async ({ text, mode }) => {
          await publishMainSessionEvent(api, { text, mode });
        },
      });

      state = out.actions.nextState;
      await store.save(api.logger, state);
      skippedOverlapCount = 0;

      api.logger.info(
        `task-watchdog: check complete runs=${runs.length} events=${out.detector.events.length} actions=${out.actions.results.length}`,
      );
    } finally {
      isRunning = false;
    }
  };

  return {
    id: "task-watchdog-service",
    async start() {
      const cfg = parsePluginConfig(api.pluginConfig ?? {});
      if (!cfg.enabled) {
        api.logger.info("task-watchdog: disabled via config");
        return;
      }

      state = await store.load(api.logger);
      await runOnce();
      timer = setInterval(() => {
        void runOnce();
      }, cfg.pollIntervalMs);

      api.logger.info(`task-watchdog: service started pollIntervalMs=${cfg.pollIntervalMs}`);
    },
    async stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      api.logger.info("task-watchdog: service stopped");
    },
  };
}
