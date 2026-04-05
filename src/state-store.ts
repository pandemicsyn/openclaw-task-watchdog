import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { PluginLogger } from "openclaw/plugin-sdk/plugin-entry";

import {
  detachedWorkDeliveryStatusSchema,
  detachedWorkEventTypeSchema,
  detachedWorkRuntimeSchema,
  detachedWorkSeveritySchema,
  detachedWorkStatusSchema,
} from "./config-schema.js";
import type { DetachedWorkHealthState } from "./types.js";

const incidentSchema = z
  .object({
    id: z.string(),
    eventType: detachedWorkEventTypeSchema,
    severity: detachedWorkSeveritySchema,
    runtime: detachedWorkRuntimeSchema,
    taskId: z.string(),
    sourceId: z.string().optional(),
    runId: z.string().optional(),
    title: z.string(),
    summary: z.string(),
    detail: z.string().optional(),
    createdAt: z.number(),
    task: z
      .object({
        status: detachedWorkStatusSchema,
        deliveryStatus: detachedWorkDeliveryStatusSchema,
        startedAt: z.number().optional(),
        endedAt: z.number().optional(),
        elapsedMs: z.number().optional(),
        label: z.string().optional(),
      })
      .strict(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const stateSchema = z
  .object({
    version: z.literal(2),
    state: z
      .object({
        dedupe: z.record(z.string(), z.number()),
        lastSeenTaskStateByTaskKey: z.record(z.string(), z.string()),
        recentIncidents: z.array(incidentSchema).default([]),
        runtimeHealthCache: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();

const legacyStateSchema = z
  .object({
    version: z.literal(1),
    state: z
      .object({
        dedupe: z.record(z.string(), z.number()),
        lastSeenTaskStateByTaskId: z.record(z.string(), z.string()),
        runtimeHealthCache: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();

const defaultState: DetachedWorkHealthState = {
  dedupe: {},
  lastSeenTaskStateByTaskKey: {},
  recentIncidents: [],
};

export function createStateStore(stateDir: string) {
  const filePath = path.join(stateDir, "task-watchdog", "health-state.json");

  return {
    async load(logger: PluginLogger): Promise<DetachedWorkHealthState> {
      try {
        const raw = await readFile(filePath, "utf8");
        const json = JSON.parse(raw) as unknown;

        const parsedV2 = stateSchema.safeParse(json);
        if (parsedV2.success) {
          const recentIncidents = parsedV2.data.state.recentIncidents.map((event) => ({
            id: event.id,
            eventType: event.eventType,
            severity: event.severity,
            runtime: event.runtime,
            taskId: event.taskId,
            ...(typeof event.sourceId === "string" ? { sourceId: event.sourceId } : {}),
            ...(typeof event.runId === "string" ? { runId: event.runId } : {}),
            title: event.title,
            summary: event.summary,
            ...(typeof event.detail === "string" ? { detail: event.detail } : {}),
            createdAt: event.createdAt,
            task: {
              status: event.task.status,
              deliveryStatus: event.task.deliveryStatus,
              ...(typeof event.task.startedAt === "number"
                ? { startedAt: event.task.startedAt }
                : {}),
              ...(typeof event.task.endedAt === "number" ? { endedAt: event.task.endedAt } : {}),
              ...(typeof event.task.elapsedMs === "number"
                ? { elapsedMs: event.task.elapsedMs }
                : {}),
              ...(typeof event.task.label === "string" ? { label: event.task.label } : {}),
            },
            ...(event.metadata ? { metadata: event.metadata } : {}),
          }));

          return {
            dedupe: parsedV2.data.state.dedupe,
            lastSeenTaskStateByTaskKey: parsedV2.data.state.lastSeenTaskStateByTaskKey,
            recentIncidents,
            ...(parsedV2.data.state.runtimeHealthCache
              ? { runtimeHealthCache: parsedV2.data.state.runtimeHealthCache }
              : {}),
          };
        }

        const parsedV1 = legacyStateSchema.safeParse(json);
        if (parsedV1.success) {
          return {
            dedupe: parsedV1.data.state.dedupe,
            lastSeenTaskStateByTaskKey: parsedV1.data.state.lastSeenTaskStateByTaskId,
            recentIncidents: [],
            ...(parsedV1.data.state.runtimeHealthCache
              ? { runtimeHealthCache: parsedV1.data.state.runtimeHealthCache }
              : {}),
          };
        }

        throw new Error("unrecognized state file shape");
      } catch (error) {
        logger.warn(
          `task-watchdog: state load fallback to defaults: ${error instanceof Error ? error.message : String(error)}`,
        );
        return { ...defaultState };
      }
    },

    async save(logger: PluginLogger, state: DetachedWorkHealthState): Promise<void> {
      try {
        await mkdir(path.dirname(filePath), { recursive: true });
        const payload = stateSchema.parse({ version: 2 as const, state });
        await writeFile(filePath, JSON.stringify(payload, null, 2));
      } catch (error) {
        logger.warn(
          `task-watchdog: state save failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },

    path: filePath,
  };
}
