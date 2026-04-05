import { renderAlertEmail } from "./email.js";

import type {
  DetachedWorkActionExecutionResult,
  DetachedWorkActionExecutor,
  DetachedWorkAlertAction,
  DetachedWorkAlertEvent,
  DetachedWorkEmailSender,
  DetachedWorkMainSessionPublisher,
  DetachedWorkRuleDecision,
  DetachedWorkWebhookClient,
} from "./types.js";

function webhookPayload(event: DetachedWorkAlertEvent): string {
  return JSON.stringify(
    {
      version: 1,
      event,
      source: {
        product: "openclaw-detached-work-health",
        generatedAt: Date.now(),
      },
    },
    null,
    2,
  );
}

function webhookHeaders(action: Extract<DetachedWorkAlertAction, { kind: "webhook" }>): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(action.secret ? { "x-openclaw-detached-work-signature": action.secret } : {}),
    ...(action.headers ?? {}),
  };
}

export class DefaultDetachedWorkActionExecutor implements DetachedWorkActionExecutor {
  constructor(
    private readonly webhookClient: DetachedWorkWebhookClient,
    private readonly emailSender: DetachedWorkEmailSender,
    private readonly mainSessionPublisher: DetachedWorkMainSessionPublisher,
  ) {}

  public async execute(
    action: DetachedWorkAlertAction,
    event: DetachedWorkAlertEvent,
    decision: DetachedWorkRuleDecision,
  ): Promise<DetachedWorkActionExecutionResult> {
    try {
      if (action.kind === "webhook") {
        await this.webhookClient.post({
          url: action.url,
          headers: webhookHeaders(action),
          body: webhookPayload(event),
          ...(typeof action.timeoutMs === "number" ? { timeoutMs: action.timeoutMs } : {}),
        });
      } else if (action.kind === "email") {
        const rendered = await renderAlertEmail({
          event,
          ...(typeof action.subjectPrefix === "string" ? { subjectPrefix: action.subjectPrefix } : {}),
        });
        await this.emailSender.send({
          provider: action.provider,
          to: action.to,
          ...(typeof action.from === "string" ? { from: action.from } : {}),
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        });
      } else {
        const prefix = action.prefix ? `${action.prefix} ` : "Detached Work Health alert: ";
        await this.mainSessionPublisher.publish({
          text: `${prefix}${event.summary}`,
          wakeMode: action.wakeMode ?? "next-heartbeat",
        });
      }

      return {
        ok: true,
        actionId: action.id,
        decision,
      };
    } catch (error) {
      return {
        ok: false,
        actionId: action.id,
        decision,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class InMemoryWebhookClient implements DetachedWorkWebhookClient {
  public readonly requests: Array<{ url: string; headers: Record<string, string>; body: string; timeoutMs?: number }> = [];

  public async post(request: {
    url: string;
    headers: Record<string, string>;
    body: string;
    timeoutMs?: number;
  }): Promise<void> {
    this.requests.push(request);
  }
}

export class InMemoryEmailSender implements DetachedWorkEmailSender {
  public readonly deliveries: Array<{
    provider: "resend" | "nodemailer";
    to: string[];
    from?: string;
    subject: string;
    text: string;
    html?: string;
  }> = [];

  public async send(input: {
    provider: "resend" | "nodemailer";
    to: string[];
    from?: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void> {
    this.deliveries.push(input);
  }
}

export class InMemoryMainSessionPublisher implements DetachedWorkMainSessionPublisher {
  public readonly messages: Array<{ text: string; wakeMode: "now" | "next-heartbeat" }> = [];

  public async publish(input: { text: string; wakeMode: "now" | "next-heartbeat" }): Promise<void> {
    this.messages.push(input);
  }
}
