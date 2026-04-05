import { describe, expect, it } from "vitest";

import { createTaskWatchdogService } from "../src/plugin-service.js";

function createApi() {
  const warnings: string[] = [];

  const api = {
    pluginConfig: {
      enabled: true,
      pollIntervalMs: 10,
      detachedWork: {
        actions: [],
        rules: [],
      },
    },
    logger: {
      debug: () => {},
      info: () => {},
      warn: (msg: string) => warnings.push(msg),
      error: () => {},
    },
    runtime: {
      state: { resolveStateDir: () => "/tmp/task-watchdog-service" },
      tasks: {
        runs: {
          bindSession: () => ({
            list: () => [],
          }),
        },
      },
      system: {
        enqueueSystemEvent: () => true,
        requestHeartbeatNow: () => {},
        runHeartbeatOnce: async () => ({ status: "ok" }),
      },
    },
  };

  return { api, warnings };
}

describe("plugin service", () => {
  it("contains overlap guard implementation", () => {
    const { api } = createApi();
    const service = createTaskWatchdogService(api as never);
    expect(service.start).toBeTypeOf("function");
    const source = createTaskWatchdogService.toString();
    expect(source.includes("isRunning")).toBe(true);
    expect(source.includes("skipped overlapping service tick")).toBe(true);
  });
});
