import type { OpenClawPluginApi, OpenClawPluginService } from "openclaw/plugin-sdk/plugin-entry";

import { runDetachedWorkPipeline } from "./engine.js";
import { parsePluginConfig } from "./plugin-config.js";
import { fetchTaskRuns } from "./openclaw-task-source.js";
import type { DetachedWorkHealthState } from "./types.js";

export function createTaskWatchdogService(api: OpenClawPluginApi): OpenClawPluginService {
  let timer: NodeJS.Timeout | null = null;
  let state: DetachedWorkHealthState = {
    dedupe: {},
    lastSeenTaskStateByTaskId: {},
  };

  const runOnce = async (): Promise<void> => {
    const cfg = parsePluginConfig(api.pluginConfig ?? {});
    if (!cfg.enabled) return;

    const runs = await fetchTaskRuns(api.logger, api.runtime.system);
    const out = await runDetachedWorkPipeline({
      runs,
      config: cfg.detachedWork,
      previousState: state,
      mainSessionSystemEvent: async ({ text, mode }) => {
        const enqueueSystemEvent = (api.runtime.system as { enqueueSystemEvent?: unknown }).enqueueSystemEvent;
        if (typeof enqueueSystemEvent === "function") {
          await (enqueueSystemEvent as (evt: unknown) => Promise<void>)({
            type: "systemEvent",
            text,
            mode,
          });
        }
      },
    });

    state = out.actions.nextState;

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
