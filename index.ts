import { Type } from "@sinclair/typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { z } from "zod";

import { runDetachedWorkPipeline } from "./src/engine.js";
import { parsePluginConfig } from "./src/plugin-config.js";
import { fetchTaskRuns } from "./src/openclaw-task-source.js";
import { createTaskWatchdogService } from "./src/plugin-service.js";
import type { DetachedWorkHealthState } from "./src/types.js";

let toolState: DetachedWorkHealthState = {
  dedupe: {},
  lastSeenTaskStateByTaskId: {},
};

export default definePluginEntry({
  id: "task-watchdog",
  name: "Task Watchdog",
  description: "Detached Work Health monitoring and alerting for OpenClaw tasks",
  register(api) {
    api.registerService(createTaskWatchdogService(api));

    api.registerTool(
      {
        name: "task_watchdog_check",
        description: "Run one Detached Work Health check against current OpenClaw tasks",
        parameters: Type.Object({
          dryRun: Type.Optional(Type.Boolean({ default: false })),
        }),
        async execute(_id, params) {
          const parsed = checkToolInputSchema.parse(params ?? {});
          const cfg = parsePluginConfig(api.pluginConfig ?? {});
          const runs = await fetchTaskRuns(api.logger, api.runtime.system);

          const out = await runDetachedWorkPipeline({
            runs,
            config: cfg.detachedWork,
            previousState: toolState,
            mainSessionSystemEvent: async ({ text, mode }) => {
              if (parsed.dryRun) return;
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

          toolState = out.actions.nextState;

          const summary = [
            `runs=${runs.length}`,
            `events=${out.detector.events.length}`,
            `actions=${out.actions.results.length}`,
            `dryRun=${String(parsed.dryRun)}`,
          ].join(" ");

          return {
            content: [{ type: "text", text: `task_watchdog_check: ${summary}` }],
          };
        },
      },
      { optional: true },
    );
  },
});

const checkToolInputSchema = z
  .object({
    dryRun: z.boolean().default(false),
  })
  .strict();
