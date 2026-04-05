import { Type } from "@sinclair/typebox";
import {
  definePluginEntry,
  type OpenClawPluginToolContext,
} from "openclaw/plugin-sdk/plugin-entry";
import { z } from "zod";

import { parsePluginConfig } from "./src/plugin-config.js";
import { createTaskWatchdogCommands } from "./src/operator-surface.js";
import { createTaskWatchdogService } from "./src/plugin-service.js";
import { publishMainSessionEvent } from "./src/system-event-publisher.js";

export default definePluginEntry({
  id: "task-watchdog",
  name: "Task Watchdog",
  description: "Task Health monitoring and alerting for OpenClaw tasks",
  register(api) {
    api.registerService(createTaskWatchdogService(api));

    for (const command of createTaskWatchdogCommands(api)) {
      api.registerCommand(command);
    }

    api.registerTool(
      {
        name: "task_watchdog_check",
        description: "Run one Task Health check against current OpenClaw tasks",
        parameters: Type.Object({
          dryRun: Type.Optional(Type.Boolean({ default: false })),
        }),
        async execute(_id, params, ctx?: OpenClawPluginToolContext) {
          const parsed = checkToolInputSchema.parse(params ?? {});
          const { createStateStore } = await import("./src/state-store.js");
          const { fetchTaskRunsFromRuntimeBySession, fetchTaskRunsFromRuntimeByToolContext } =
            await import("./src/openclaw-task-source.js");
          const { runTaskHealthPipeline } = await import("./src/engine.js");

          const cfg = parsePluginConfig(api.pluginConfig ?? {});
          const store = createStateStore(api.runtime.state.resolveStateDir());
          const previousState = await store.load(api.logger);
          const runs = ctx
            ? fetchTaskRunsFromRuntimeByToolContext(api.logger, api.runtime, {
                sessionKey: ctx.sessionKey,
                ...(ctx.deliveryContext ? { deliveryContext: ctx.deliveryContext } : {}),
              })
            : fetchTaskRunsFromRuntimeBySession(api.logger, api.runtime, "main");

          const out = await runTaskHealthPipeline({
            runs,
            config: cfg.detachedWork,
            previousState,
            mainSessionSystemEvent: async ({ text, mode }) => {
              if (parsed.dryRun) return;
              await publishMainSessionEvent(api, { text, mode });
            },
          });

          await store.save(api.logger, out.actions.nextState);

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
