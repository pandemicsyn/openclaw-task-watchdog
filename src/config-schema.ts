import { z } from "zod";

export const detachedWorkSeveritySchema = z.enum(["info", "warning", "critical"]);
export const detachedWorkRuntimeSchema = z.enum(["cron", "acp", "subagent", "cli"]);
export const detachedWorkStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "timed_out",
  "lost",
  "cancelled",
]);
export const detachedWorkDeliveryStatusSchema = z.enum([
  "pending",
  "delivered",
  "session_queued",
  "failed",
  "parent_missing",
  "not_applicable",
]);
export const detachedWorkEventTypeSchema = z.enum([
  "task_failed",
  "task_timed_out",
  "task_lost",
  "task_stale_running",
  "delivery_failed",
  "failure_streak",
  "recovered",
]);

export const thresholdConfigSchema = z
  .object({
    staleRunningMinutes: z.number().int().positive().optional(),
    criticalRunningMinutes: z.number().int().positive().optional(),
    failureStreakCount: z.number().int().positive().optional(),
    lookbackMinutes: z.number().int().positive().optional(),
  })
  .strict();

export const thresholdsByRuntimeSchema = z
  .object({
    cron: thresholdConfigSchema.optional(),
    acp: thresholdConfigSchema.optional(),
    subagent: thresholdConfigSchema.optional(),
    cli: thresholdConfigSchema.optional(),
  })
  .partial()
  .strict();

export const alertRuleSchema = z
  .object({
    id: z.string().min(1),
    enabled: z.boolean().optional(),
    eventTypes: z.array(detachedWorkEventTypeSchema).min(1),
    runtimes: z.array(detachedWorkRuntimeSchema).optional(),
    minSeverity: detachedWorkSeveritySchema.optional(),
    actionIds: z.array(z.string().min(1)).min(1),
    cooldownMinutes: z.number().int().nonnegative().optional(),
  })
  .strict();

export const alertActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: z.string().min(1),
      kind: z.literal("webhook"),
      enabled: z.boolean().optional(),
      url: z.string().url(),
      secret: z.string().optional(),
      headers: z.record(z.string(), z.string()).optional(),
      timeoutMs: z.number().int().positive().optional(),
      retryCount: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      kind: z.literal("email"),
      enabled: z.boolean().optional(),
      provider: z.enum(["resend", "nodemailer"]),
      to: z.array(z.string().email()).min(1),
      from: z.string().email().optional(),
      subjectPrefix: z.string().optional(),
      retryCount: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      kind: z.literal("main_session_prompt"),
      enabled: z.boolean().optional(),
      wakeMode: z.enum(["now", "next-heartbeat"]).optional(),
      prefix: z.string().optional(),
    })
    .strict(),
]);

export const emailProviderConfigSchema = z
  .object({
    resend: z
      .object({
        apiKey: z.string().min(1),
        defaultFrom: z.string().email(),
      })
      .strict()
      .optional(),
    nodemailer: z
      .object({
        host: z.string().min(1),
        port: z.number().int().positive(),
        secure: z.boolean().optional(),
        user: z.string().optional(),
        pass: z.string().optional(),
        defaultFrom: z.string().email(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const detachedWorkConfigSchema = z
  .object({
    thresholdsByRuntime: thresholdsByRuntimeSchema.optional(),
    rules: z.array(alertRuleSchema).default([]),
    actions: z.array(alertActionSchema).default([]),
    emailProviders: emailProviderConfigSchema.optional(),
  })
  .strict();

export type TaskHealthConfigInput = z.input<typeof detachedWorkConfigSchema>;
export type TaskHealthConfig = z.output<typeof detachedWorkConfigSchema>;

export function parseTaskHealthConfig(input: TaskHealthConfigInput): TaskHealthConfig {
  return detachedWorkConfigSchema.parse(input);
}
