import { z } from "zod";

import type { PluginLogger, OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";

import type { DetachedWorkTaskRun } from "./types.js";

const taskRunViewSchema = z
  .object({
    id: z.string(),
    runtime: z.enum(["cron", "acp", "subagent", "cli"]),
    status: z.string(),
    deliveryStatus: z.string(),
    startedAt: z.number().optional(),
    endedAt: z.number().optional(),
    sourceId: z.string().optional(),
    runId: z.string().optional(),
    label: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();

const taskRunListSchema = z.array(taskRunViewSchema);

function mapTaskRun(view: z.infer<typeof taskRunViewSchema>): DetachedWorkTaskRun {
  return {
    taskId: view.id,
    runtime: view.runtime,
    status: view.status,
    deliveryStatus: view.deliveryStatus,
    ...(typeof view.startedAt === "number" ? { startedAt: view.startedAt } : {}),
    ...(typeof view.endedAt === "number" ? { endedAt: view.endedAt } : {}),
    ...(typeof view.sourceId === "string" ? { sourceId: view.sourceId } : {}),
    ...(typeof view.runId === "string" ? { runId: view.runId } : {}),
    ...(typeof view.label === "string" ? { label: view.label } : {}),
    ...(typeof view.error === "string" ? { detail: view.error } : {}),
  };
}

type RuntimeTaskRunsSurface = {
  tasks: {
    runs: {
      bindSession: (params: { sessionKey: string }) => { list: () => unknown };
      fromToolContext: (ctx: Pick<OpenClawPluginToolContext, "sessionKey" | "deliveryContext">) => {
        list: () => unknown;
      };
    };
  };
};

export function fetchTaskRunsFromRuntimeBySession(
  logger: PluginLogger,
  runtime: RuntimeTaskRunsSurface,
  sessionKey: string,
): DetachedWorkTaskRun[] {
  try {
    const bound = runtime.tasks.runs.bindSession({ sessionKey });
    const views = taskRunListSchema.parse(bound.list());
    return views.map(mapTaskRun);
  } catch (error) {
    logger.warn(
      `task-watchdog: failed to fetch task runs from runtime session binding: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

export function fetchTaskRunsFromRuntimeByToolContext(
  logger: PluginLogger,
  runtime: RuntimeTaskRunsSurface,
  ctx: Pick<OpenClawPluginToolContext, "sessionKey" | "deliveryContext">,
): DetachedWorkTaskRun[] {
  try {
    const bound = runtime.tasks.runs.fromToolContext(ctx);
    const views = taskRunListSchema.parse(bound.list());
    return views.map(mapTaskRun);
  } catch (error) {
    logger.warn(
      `task-watchdog: failed to fetch task runs from runtime tool context: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}
