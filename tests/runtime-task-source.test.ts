import { describe, expect, it } from "vitest";

import {
  fetchTaskRunsFromRuntimeBySession,
  fetchTaskRunsFromRuntimeByToolContext,
} from "../src/openclaw-task-source.js";

function logger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

describe("runtime task source", () => {
  it("maps task runs via bindSession", () => {
    const runtime = {
      tasks: {
        runs: {
          bindSession: () => ({
            list: () => [
              {
                id: "task-1",
                runtime: "cron",
                status: "failed",
                deliveryStatus: "failed",
                startedAt: 100,
                endedAt: 150,
              },
            ],
          }),
        },
      },
    };

    const runs = fetchTaskRunsFromRuntimeBySession(logger() as never, runtime as never, "main");
    expect(runs).toHaveLength(1);
    expect(runs[0]?.taskId).toBe("task-1");
    expect(runs[0]?.runtime).toBe("cron");
  });

  it("maps task runs via tool context", () => {
    const runtime = {
      tasks: {
        runs: {
          fromToolContext: () => ({
            list: () => [
              {
                id: "task-ctx",
                runtime: "cron",
                status: "timed_out",
                deliveryStatus: "failed",
              },
            ],
          }),
        },
      },
    };

    const runs = fetchTaskRunsFromRuntimeByToolContext(
      logger() as never,
      runtime as never,
      {
        sessionKey: "session:1",
      } as never,
    );
    expect(runs[0]?.taskId).toBe("task-ctx");
  });
});
