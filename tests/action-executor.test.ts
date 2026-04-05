import { describe, expect, it } from "vitest";

import {
  DefaultDetachedWorkActionExecutor,
  InMemoryEmailSender,
  InMemoryMainSessionPublisher,
  InMemoryWebhookClient,
} from "../src/action-executor.js";
import type { DetachedWorkAlertEvent } from "../src/types.js";

const event: DetachedWorkAlertEvent = {
  id: "event-1",
  eventType: "task_timed_out",
  severity: "critical",
  runtime: "cron",
  taskId: "task-1",
  title: "Detached Work Health task_timed_out",
  summary: "cron task timed out",
  createdAt: Date.UTC(2026, 3, 5, 6, 30, 0),
  task: {
    status: "timed_out",
    deliveryStatus: "failed",
    label: "Morning brief",
  },
};

describe("DefaultDetachedWorkActionExecutor", () => {
  it("executes webhook action", async () => {
    const webhooks = new InMemoryWebhookClient();
    const emails = new InMemoryEmailSender();
    const prompts = new InMemoryMainSessionPublisher();
    const executor = new DefaultDetachedWorkActionExecutor(webhooks, emails, prompts);

    const result = await executor.execute(
      { id: "webhook-1", kind: "webhook", url: "https://example.test/hook", secret: "s3cr3t" },
      event,
      { ruleId: "r1", actionId: "webhook-1", eventId: event.id },
    );

    expect(result.ok).toBe(true);
    expect(webhooks.requests).toHaveLength(1);
    expect(webhooks.requests[0]?.headers["x-openclaw-detached-work-signature"]).toBe("s3cr3t");
  });

  it("executes email action", async () => {
    const webhooks = new InMemoryWebhookClient();
    const emails = new InMemoryEmailSender();
    const prompts = new InMemoryMainSessionPublisher();
    const executor = new DefaultDetachedWorkActionExecutor(webhooks, emails, prompts);

    const result = await executor.execute(
      {
        id: "email-1",
        kind: "email",
        provider: "resend",
        to: ["ops@example.com"],
        subjectPrefix: "[Watchdog]",
      },
      event,
      { ruleId: "r1", actionId: "email-1", eventId: event.id },
    );

    expect(result.ok).toBe(true);
    expect(emails.deliveries).toHaveLength(1);
    expect(emails.deliveries[0]?.subject).toContain("[Watchdog]");
  });

  it("executes main session prompt action", async () => {
    const webhooks = new InMemoryWebhookClient();
    const emails = new InMemoryEmailSender();
    const prompts = new InMemoryMainSessionPublisher();
    const executor = new DefaultDetachedWorkActionExecutor(webhooks, emails, prompts);

    const result = await executor.execute(
      {
        id: "prompt-1",
        kind: "main_session_prompt",
        wakeMode: "now",
        prefix: "DWH:",
      },
      event,
      { ruleId: "r1", actionId: "prompt-1", eventId: event.id },
    );

    expect(result.ok).toBe(true);
    expect(prompts.messages).toHaveLength(1);
    expect(prompts.messages[0]?.text.startsWith("DWH:")).toBe(true);
    expect(prompts.messages[0]?.wakeMode).toBe("now");
  });

  it("retries retryable webhook failures", async () => {
    let attempts = 0;
    const executor = new DefaultDetachedWorkActionExecutor(
      {
        post: async () => {
          attempts += 1;
          if (attempts < 3) throw new Error("503 upstream unavailable");
        },
      },
      new InMemoryEmailSender(),
      new InMemoryMainSessionPublisher(),
    );

    const result = await executor.execute(
      {
        id: "webhook-retry",
        kind: "webhook",
        url: "https://example.test/hook",
        retryCount: 2,
      },
      event,
      { ruleId: "r1", actionId: "webhook-retry", eventId: event.id },
    );

    expect(result.ok).toBe(true);
    expect(attempts).toBe(3);
  });
});
