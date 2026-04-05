import { promisify } from "node:util";
import { execFile } from "node:child_process";

import type { PluginLogger } from "openclaw/plugin-sdk/plugin-entry";

import { parseTaskRunsFromUnknown } from "./plugin-io.js";
import type { DetachedWorkTaskRun } from "./types.js";

const execFileAsync = promisify(execFile);

export async function fetchTaskRuns(logger: PluginLogger, runtimeSystem: unknown): Promise<DetachedWorkTaskRun[]> {
  const runCommandWithTimeout = (runtimeSystem as { runCommandWithTimeout?: unknown }).runCommandWithTimeout;

  let stdout = "";
  try {
    if (typeof runCommandWithTimeout === "function") {
      const res = (await (runCommandWithTimeout as (
        cmd: string,
        args: string[],
        opts: { timeoutMs: number },
      ) => Promise<{ stdout?: string }>)("openclaw", ["tasks", "list", "--json"], {
        timeoutMs: 20_000,
      })) as { stdout?: string };
      stdout = res.stdout ?? "";
    } else {
      const res = await execFileAsync("openclaw", ["tasks", "list", "--json"], { timeout: 20_000 });
      stdout = res.stdout ?? "";
    }
  } catch (error) {
    logger.warn(
      `task-watchdog: failed to fetch tasks from openclaw CLI: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }

  if (!stdout.trim()) return [];

  try {
    const parsed = JSON.parse(stdout) as unknown;
    return parseTaskRunsFromUnknown(parsed);
  } catch (error) {
    logger.warn(
      `task-watchdog: failed to parse openclaw tasks JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}
