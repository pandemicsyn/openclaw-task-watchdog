import { describe, expect, it } from "vitest";

import { renderAlertEmail } from "../src/email.js";
import type { TaskHealthAlertEvent } from "../src/types.js";

const event: TaskHealthAlertEvent = {
  id: "event-1",
  eventType: "task_timed_out",
  severity: "critical",
  runtime: "cron",
  taskId: "task-11",
  title: "Task Health task_timed_out",
  summary: "cron task timed out",
  createdAt: Date.UTC(2026, 3, 5, 9, 0, 0),
  task: {
    status: "timed_out",
    deliveryStatus: "failed",
  },
};

describe("renderAlertEmail", () => {
  it("renders subject/html/text", async () => {
    const rendered = await renderAlertEmail({ event, subjectPrefix: "[Watchdog]" });

    expect(rendered.subject).toContain("[Watchdog]");
    expect(rendered.text).toContain("task_timed_out");
    expect(rendered.html).toContain("Task Health");
  });
});
