import { z } from "zod";

import { detachedWorkConfigSchema } from "./config-schema.js";

export const pluginConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    pollIntervalMs: z.number().int().positive().default(60_000),
    detachedWork: detachedWorkConfigSchema.default({ rules: [], actions: [] }),
  })
  .strict();

export type PluginConfig = z.output<typeof pluginConfigSchema>;

export function parsePluginConfig(input: unknown): PluginConfig {
  return pluginConfigSchema.parse(input ?? {});
}
