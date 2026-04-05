import { describe, expect, it } from "vitest";

import { createTaskWatchdogCommands } from "../src/operator-surface.js";

function createApi() {
  return {
    pluginConfig: {},
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    runtime: {
      state: { resolveStateDir: () => "/tmp/task-watchdog-tests" },
      tasks: {
        runs: {
          bindSession: () => ({
            list: () => [
              {
                id: "task-1",
                runtime: "cron",
                status: "failed",
                deliveryStatus: "failed",
              },
            ],
          }),
          fromToolContext: () => ({ list: () => [] }),
        },
      },
      system: {
        enqueueSystemEvent: async () => {},
      },
    },
  };
}

describe("operator surface", () => {
  it("registers check + status commands", () => {
    const commands = createTaskWatchdogCommands(createApi() as never);
    expect(commands.map((c) => c.name).sort()).toEqual([
      "task-watchdog-check",
      "task-watchdog-status",
    ]);
  });

  it("renders status command output", async () => {
    const commands = createTaskWatchdogCommands(createApi() as never);
    const status = commands.find((c) => c.name === "task-watchdog-status");
    const result = await status?.handler({
      channel: "discord",
      isAuthorizedSender: true,
      commandBody: "task-watchdog-status",
      config: {} as never,
      sessionKey: "main",
    } as never);

    expect(result?.text).toContain("task-watchdog-status");
    expect(result?.text).toContain("overall=");
  });
});
