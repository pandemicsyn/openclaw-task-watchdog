import { z } from "zod";

import {
  detachedWorkDeliveryStatusSchema,
  detachedWorkRuntimeSchema,
  detachedWorkStatusSchema,
} from "./config-schema.js";
import type { DetachedWorkTaskRun } from "./types.js";

const isoOrMsSchema = z.union([z.number(), z.string()]).optional();

const taskItemSchema = z
  .object({
    id: z.string().optional(),
    taskId: z.string().optional(),
    runId: z.string().optional(),
    sourceId: z.string().optional(),
    label: z.string().optional(),
    runtime: z.string().optional(),
    status: z.string().optional(),
    state: z.string().optional(),
    deliveryStatus: z.string().optional(),
    startedAt: isoOrMsSchema,
    endedAt: isoOrMsSchema,
    createdAt: isoOrMsSchema,
    updatedAt: isoOrMsSchema,
    detail: z.string().optional(),
    error: z.string().optional(),
    progressSummary: z.string().optional(),
    terminalSummary: z.string().optional(),
  })
  .strict()
  .catchall(z.unknown());

const tasksEnvelopeSchema = z
  .object({ tasks: z.array(taskItemSchema) })
  .strict()
  .catchall(z.unknown());
const itemsEnvelopeSchema = z
  .object({ items: z.array(taskItemSchema) })
  .strict()
  .catchall(z.unknown());

const taskListEnvelopeSchema = z.union([
  z.array(taskItemSchema),
  tasksEnvelopeSchema,
  itemsEnvelopeSchema,
]);

function parseMs(value: z.infer<typeof isoOrMsSchema>): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && value.trim() !== "") return n;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeRuntime(runtime: string | undefined) {
  return detachedWorkRuntimeSchema.catch("cli").parse(runtime);
}

function normalizeStatus(status: string | undefined, state: string | undefined) {
  return detachedWorkStatusSchema.catch("queued").parse(status ?? state);
}

function normalizeDeliveryStatus(deliveryStatus: string | undefined) {
  return detachedWorkDeliveryStatusSchema.catch("not_applicable").parse(deliveryStatus);
}

export function parseTaskRunsFromUnknown(input: unknown): DetachedWorkTaskRun[] {
  const parsed = taskListEnvelopeSchema.parse(input);
  const rows = Array.isArray(parsed)
    ? parsed
    : tasksEnvelopeSchema.safeParse(parsed).success
      ? tasksEnvelopeSchema.parse(parsed).tasks
      : itemsEnvelopeSchema.parse(parsed).items;

  return rows.map((row, index) => {
    const startedAt = parseMs(row.startedAt) ?? parseMs(row.createdAt);
    const endedAt = parseMs(row.endedAt) ?? parseMs(row.updatedAt);
    const taskId = row.taskId ?? row.id ?? row.runId ?? `unknown-${index}`;
    const detail = row.detail ?? row.error ?? row.progressSummary ?? row.terminalSummary;

    return {
      taskId,
      runtime: normalizeRuntime(row.runtime),
      status: normalizeStatus(row.status, row.state),
      deliveryStatus: normalizeDeliveryStatus(row.deliveryStatus),
      ...(typeof startedAt === "number" ? { startedAt } : {}),
      ...(typeof endedAt === "number" ? { endedAt } : {}),
      ...(typeof row.label === "string" ? { label: row.label } : {}),
      ...(typeof row.sourceId === "string" ? { sourceId: row.sourceId } : {}),
      ...(typeof row.runId === "string" ? { runId: row.runId } : {}),
      ...(typeof detail === "string" ? { detail } : {}),
    };
  });
}
