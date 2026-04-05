import { describe, expect, it } from "vitest";

import { createTaskWatchdogService } from "../src/plugin-service.js";

function createApi() {
  const warnings: string[] = [];
  let resolveList: (() => void) | null = null;
  let callCount = 0;

  const api = {
    pluginConfig: { enabled: true, pollIntervalMs: 10, detachedWork: { rules: [], actions: [] } },
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
            list: async () => {
              callCount += 1;
              await new Promise<void>((resolve) => {
                resolveList = resolve;
              });
              return [];
            },
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

  return { api, warnings, release: () => resolveList?.(), getCallCount: () => callCount };
}

describe("plugin service", () => {
  it("guards overlapping runs", async () => {
    const { api, warnings, release } = createApi();
    const service = createTaskWatchdogService(api as never);

    await service.start({} as never);
    setTimeout(() => release(), 25);
    await new Promise((resolve) => setTimeout(resolve, 40));
    await service.stop?.({} as never);

    expect(warnings.some((w) => w.includes("skipped overlapping service tick"))).toBe(true);
  });
});
