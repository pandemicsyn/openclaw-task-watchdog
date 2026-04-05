import type { OpenClawPluginApi, OpenClawPluginService } from "openclaw/plugin-sdk/plugin-entry";

import { runDetachedWorkPipeline } from "./engine.js";
import { parsePluginConfig } from "./plugin-config.js";
import { fetchTaskRunsFromRuntimeBySession } from "./openclaw-task-source.js";
import { createStateStore } from "./state-store.js";
import { publishMainSessionEvent } from "./system-event-publisher.js";
import type { DetachedWorkHealthState } from "./types.js";

export function createTaskWatchdogService(api: OpenClawPluginApi): OpenClawPluginService {
  let timer: NodeJS.Timeout | null = null;
  const store = createStateStore(api.runtime.state.resolveStateDir());
  let state: DetachedWorkHealthState = {
    dedupe: {},
    lastSeenTaskStateByTaskId: {},
  };

  const runOnce = async (): Promise<void> => {
    const cfg = parsePluginConfig(api.pluginConfig ?? {});
    if (!cfg.enabled) return;

    const runs = fetchTaskRunsFromRuntimeBySession(api.logger, api.runtime, "main");
    const out = await runDetachedWorkPipeline({
      runs,
      config: cfg.detachedWork,
      previousState: state,
      mainSessionSystemEvent: async ({ text, mode }) => {
        await publishMainSessionEvent(api, { text, mode });
      },
    });

    state = out.actions.nextState;
    await store.save(api.logger, state);

    api.logger.info(
      `task-watchdog: check complete runs=${runs.length} events=${out.detector.events.length} actions=${out.actions.results.length}`,
    );
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
