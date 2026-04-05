import { describe, expect, it } from "vitest";

import {
  InMemoryTaskRuntimeReader,
  OpenClawSessionTaskRuntimeReader,
  OpenClawToolContextTaskRuntimeReader,
} from "../src/runtime-reader.js";

describe("runtime readers", () => {
  it("returns in-memory runs", async () => {
    const reader = new InMemoryTaskRuntimeReader([
      { taskId: "a", runtime: "cron", status: "failed", deliveryStatus: "failed" },
    ]);
    const runs = await reader.listRuns();
    expect(runs).toHaveLength(1);
  });

  it("reads from session runtime", async () => {
    const reader = new OpenClawSessionTaskRuntimeReader(
      { warn: () => {}, info: () => {}, error: () => {} } as never,
      {
        tasks: {
          runs: {
            bindSession: () => ({
              list: () => [
                { id: "x", runtime: "cron", status: "failed", deliveryStatus: "failed" },
              ],
            }),
            fromToolContext: () => ({ list: () => [] }),
          },
        },
      },
      "main",
    );

    const runs = await reader.listRuns();
    expect(runs[0]?.taskId).toBe("x");
  });

  it("reads from tool context runtime", async () => {
    const reader = new OpenClawToolContextTaskRuntimeReader(
      { warn: () => {}, info: () => {}, error: () => {} } as never,
      {
        tasks: {
          runs: {
            bindSession: () => ({ list: () => [] }),
            fromToolContext: () => ({
              list: () => [
                { id: "y", runtime: "cron", status: "timed_out", deliveryStatus: "failed" },
              ],
            }),
          },
        },
      },
      { sessionKey: "main" } as never,
    );

    const runs = await reader.listRuns();
    expect(runs[0]?.taskId).toBe("y");
  });
});
