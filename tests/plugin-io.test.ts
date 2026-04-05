import { describe, expect, it } from "vitest";

import { parseTaskRunsFromUnknown } from "../src/plugin-io.js";

describe("parseTaskRunsFromUnknown", () => {
  it("parses plain array input", () => {
    const runs = parseTaskRunsFromUnknown([
      {
        id: "task-a",
        runtime: "cron",
        status: "failed",
        deliveryStatus: "sent",
        startedAt: 100,
        endedAt: 150,
      },
    ]);

    expect(runs).toHaveLength(1);
    expect(runs[0]?.taskId).toBe("task-a");
    expect(runs[0]?.runtime).toBe("cron");
  });

  it("parses envelope input with ISO timestamps", () => {
    const runs = parseTaskRunsFromUnknown({
      tasks: [
        {
          taskId: "task-b",
          runtime: "cron",
          state: "timed_out",
          deliveryStatus: "failed",
          startedAt: "2026-04-05T00:00:00.000Z",
          endedAt: "2026-04-05T00:01:00.000Z",
        },
      ],
    });

    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("timed_out");
    expect(typeof runs[0]?.startedAt).toBe("number");
  });
});
