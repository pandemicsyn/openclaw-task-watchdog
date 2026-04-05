import { z } from "zod";

import type {
  OpenClawPluginApi,
  OpenClawPluginCommandDefinition,
  OpenClawPluginToolContext,
} from "openclaw/plugin-sdk/plugin-entry";

import { runDetachedWorkPipeline } from "./engine.js";
import { fetchTaskRunsFromRuntimeBySession, fetchTaskRunsFromRuntimeByToolContext } from "./openclaw-task-source.js";
import { parsePluginConfig } from "./plugin-config.js";
import { createStateStore } from "./state-store.js";
import { publishMainSessionEvent } from "./system-event-publisher.js";
import type { DetachedWorkHealthSnapshot } from "./types.js";

const checkArgsSchema = z
  .object({
    dryRun: z.boolean().default(false),
  })
  .strict();

const statusArgsSchema = z
  .object({
    sessionKey: z.string().min(1).optional(),
  })
  .strict();

function parseKeyValueArgs(raw: string | undefined): Record<string, string> {
  if (!raw) return {};

  const out: Record<string, string> = {};
  for (const token of raw.split(/\s+/).filter(Boolean)) {
    const [k, ...rest] = token.split("=");
    if (!k || rest.length === 0) continue;
    out[k] = rest.join("=");
  }
  return out;
}

function snapshotText(snapshot: DetachedWorkHealthSnapshot): string {
  const runtime = snapshot.runtimes[0];
  if (!runtime) return `overall=${snapshot.overall} generatedAt=${snapshot.generatedAt}`;

  return [
    `overall=${snapshot.overall}`,
    `runtime=${runtime.runtime}`,
    `health=${runtime.health}`,
    `active=${runtime.active}`,
    `recentFailures=${runtime.recentFailures}`,
    `recentTimedOut=${runtime.recentTimedOut}`,
    `recentLost=${runtime.recentLost}`,
    `recentDeliveryFailures=${runtime.recentDeliveryFailures}`,
    `staleRunning=${runtime.staleRunning}`,
  ].join(" ");
}

async function runCheckForTool(
  api: OpenClawPluginApi,
  ctx: OpenClawPluginToolContext | undefined,
  dryRun: boolean,
): Promise<{ summary: string; statePath: string }> {
  const cfg = parsePluginConfig(api.pluginConfig ?? {});
  const store = createStateStore(api.runtime.state.resolveStateDir());
  const previousState = await store.load(api.logger);

  const runs = ctx?.sessionKey
    ? fetchTaskRunsFromRuntimeByToolContext(api.logger, api.runtime, {
        sessionKey: ctx.sessionKey,
        ...(ctx.deliveryContext ? { deliveryContext: ctx.deliveryContext } : {}),
      })
    : fetchTaskRunsFromRuntimeBySession(api.logger, api.runtime, "main");

  const out = await runDetachedWorkPipeline({
    runs,
    config: cfg.detachedWork,
    previousState,
    mainSessionSystemEvent: async ({ text, mode }) => {
      if (dryRun) return;
      await publishMainSessionEvent(api, { text, mode });
    },
  });

  await store.save(api.logger, out.actions.nextState);

  return {
    summary: [
      `runs=${runs.length}`,
      `events=${out.detector.events.length}`,
      `actions=${out.actions.results.length}`,
      `dryRun=${String(dryRun)}`,
    ].join(" "),
    statePath: store.path,
  };
}

export function createTaskWatchdogCommands(api: OpenClawPluginApi): OpenClawPluginCommandDefinition[] {
  return [
    {
      name: "task-watchdog-check",
      description: "Run Detached Work Health check now",
      acceptsArgs: true,
      handler: async (ctx) => {
        const parsed = checkArgsSchema.parse({
          dryRun: parseKeyValueArgs(ctx.args).dryRun === "true",
        });

        const result = await runCheckForTool(api, undefined, parsed.dryRun);
        return {
          text: `task-watchdog-check ${result.summary} statePath=${result.statePath}`,
        };
      },
    },
    {
      name: "task-watchdog-status",
      description: "Show Detached Work Health snapshot for current session or a specified sessionKey",
      acceptsArgs: true,
      handler: async (ctx) => {
        const parsed = statusArgsSchema.parse({
          sessionKey: parseKeyValueArgs(ctx.args).sessionKey,
        });

        const sessionKey = parsed.sessionKey ?? ctx.sessionKey ?? "main";
        const cfg = parsePluginConfig(api.pluginConfig ?? {});
        const store = createStateStore(api.runtime.state.resolveStateDir());
        const previousState = await store.load(api.logger);
        const runs = fetchTaskRunsFromRuntimeBySession(api.logger, api.runtime, sessionKey);
        const out = await runDetachedWorkPipeline({
          runs,
          config: cfg.detachedWork,
          previousState,
          mainSessionSystemEvent: async (_event) => {},
        });

        return {
          text: `task-watchdog-status sessionKey=${sessionKey} ${snapshotText(out.detector.snapshot)}`,
        };
      },
    },
  ];
}
