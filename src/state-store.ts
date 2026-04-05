import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { PluginLogger } from "openclaw/plugin-sdk/plugin-entry";

import type { DetachedWorkHealthState } from "./types.js";

const stateSchema = z
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
  lastSeenTaskStateByTaskId: {},
};

export function createStateStore(stateDir: string) {
  const filePath = path.join(stateDir, "task-watchdog", "health-state.json");

  return {
    async load(logger: PluginLogger): Promise<DetachedWorkHealthState> {
      try {
        const raw = await readFile(filePath, "utf8");
        const parsed = stateSchema.parse(JSON.parse(raw));
        return {
          dedupe: parsed.state.dedupe,
          lastSeenTaskStateByTaskId: parsed.state.lastSeenTaskStateByTaskId,
          ...(parsed.state.runtimeHealthCache ? { runtimeHealthCache: parsed.state.runtimeHealthCache } : {}),
        };
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
        const payload = stateSchema.parse({ version: 1 as const, state });
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
