import { z } from "zod";

import type { PluginLogger, OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";

import {
  detachedWorkDeliveryStatusSchema,
  detachedWorkRuntimeSchema,
  detachedWorkStatusSchema,
} from "./config-schema.js";
import type { TaskHealthTaskRun } from "./types.js";

const taskRunViewSchema = z
  .object({
    id: z.string(),
    runtime: detachedWorkRuntimeSchema,
    status: detachedWorkStatusSchema,
    deliveryStatus: detachedWorkDeliveryStatusSchema,
    startedAt: z.number().optional(),
    endedAt: z.number().optional(),
    sourceId: z.string().optional(),
    runId: z.string().optional(),
    label: z.string().optional(),
    error: z.string().optional(),
    progressSummary: z.string().optional(),
    terminalSummary: z.string().optional(),
  })
  .strict()
  .catchall(z.unknown());

const taskRunListSchema = z.array(taskRunViewSchema);

function mapTaskRun(view: z.infer<typeof taskRunViewSchema>): TaskHealthTaskRun {
  const detail = view.error ?? view.progressSummary ?? view.terminalSummary;
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
    ...(typeof detail === "string" ? { detail } : {}),
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
): TaskHealthTaskRun[] {
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
): TaskHealthTaskRun[] {
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
