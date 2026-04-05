import { describe, expect, it } from "vitest";

import { parseTaskHealthConfig } from "../src/config-schema.js";

describe("parseTaskHealthConfig", () => {
  it("accepts a valid config", () => {
    const parsed = parseTaskHealthConfig({
      thresholdsByRuntime: {
        cron: {
          staleRunningMinutes: 10,
        },
      },
      actions: [
        { id: "webhook-1", kind: "webhook", url: "https://example.test/hook" },
        { id: "prompt-1", kind: "main_session_prompt", wakeMode: "now" },
      ],
      rules: [
        {
          id: "rule-1",
          eventTypes: ["task_failed"],
          actionIds: ["webhook-1"],
        },
      ],
    });

    expect(parsed.actions).toHaveLength(2);
  });

  it("rejects invalid webhook URL", () => {
    expect(() =>
      parseTaskHealthConfig({
        actions: [{ id: "w", kind: "webhook", url: "not-a-url" }],
        rules: [],
      }),
    ).toThrowError();
  });
});
