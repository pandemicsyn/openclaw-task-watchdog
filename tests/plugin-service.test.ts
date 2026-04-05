import { describe, expect, it } from "vitest";

import { createTaskWatchdogService } from "../src/plugin-service.js";

function createApi() {
  const warnings: string[] = [];
  let heartbeatRelease: (() => void) | null = null;
  let heartbeatCalls = 0;

  const api = {
    pluginConfig: {
      enabled: true,
      pollIntervalMs: 10,
      detachedWork: {
        actions: [{ id: "prompt-1", kind: "main_session_prompt", wakeMode: "now" }],
        rules: [{ id: "rule-1", eventTypes: ["task_failed"], actionIds: ["prompt-1"] }],
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
            list: () => [
              {
                id: "task-1",
                runtime: "cron",
                status: "failed",
                deliveryStatus: "delivered",
              },
            ],
          }),
        },
      },
      system: {
        enqueueSystemEvent: () => true,
        requestHeartbeatNow: () => {},
        runHeartbeatOnce: async () => {
          heartbeatCalls += 1;
          if (heartbeatCalls === 1) {
            return { status: "ok" };
          }
          await new Promise<void>((resolve) => {
            heartbeatRelease = resolve;
          });
          return { status: "ok" };
        },
      },
    },
  };

  return { api, warnings, release: () => heartbeatRelease?.() };
}

describe("plugin service", () => {
  it("guards overlapping runs", async () => {
    const { api, warnings, release } = createApi();
    const service = createTaskWatchdogService(api as never);

    await service.start({} as never);
    await new Promise((resolve) => setTimeout(resolve, 35));
    release();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await service.stop?.({} as never);

    expect(warnings.some((w) => w.includes("skipped overlapping service tick"))).toBe(true);
  });
});
