import { renderAlertEmail } from "./email.js";
import { retry } from "./retry.js";

import type {
  TaskHealthActionExecutionResult,
  TaskHealthActionExecutor,
  TaskHealthAlertAction,
  TaskHealthAlertEvent,
  TaskHealthEmailSender,
  TaskHealthMainSessionPublisher,
  TaskHealthRuleDecision,
  TaskHealthWebhookClient,
} from "./types.js";

function webhookPayload(event: TaskHealthAlertEvent): string {
  return JSON.stringify(
    {
      version: 1,
      event,
      source: {
        product: "openclaw-task-health",
        generatedAt: Date.now(),
      },
    },
    null,
    2,
  );
}

function webhookHeaders(
  action: Extract<TaskHealthAlertAction, { kind: "webhook" }>,
): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(action.secret ? { "x-openclaw-task-health-signature": action.secret } : {}),
    ...(action.headers ?? {}),
  };
}

function retryCountForAction(action: TaskHealthAlertAction): number {
  if (action.kind === "main_session_prompt") return 1;
  return Math.max(1, (action.retryCount ?? 0) + 1);
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const message = error.message.toLowerCase();
  if (message.includes("abort") || message.includes("timeout")) return true;
  if (message.includes("429")) return true;
  if (message.includes("502") || message.includes("503") || message.includes("504")) return true;
  if (message.includes("network")) return true;
  return false;
}

export class DefaultTaskHealthActionExecutor implements TaskHealthActionExecutor {
  constructor(
    private readonly webhookClient: TaskHealthWebhookClient,
    private readonly emailSender: TaskHealthEmailSender,
    private readonly mainSessionPublisher: TaskHealthMainSessionPublisher,
  ) {}

  public async execute(
    action: TaskHealthAlertAction,
    event: TaskHealthAlertEvent,
    decision: TaskHealthRuleDecision,
  ): Promise<TaskHealthActionExecutionResult> {
    try {
      await retry(
        async () => {
          if (action.kind === "webhook") {
            await this.webhookClient.post({
              url: action.url,
              headers: webhookHeaders(action),
              body: webhookPayload(event),
              ...(typeof action.timeoutMs === "number" ? { timeoutMs: action.timeoutMs } : {}),
            });
            return;
          }

          if (action.kind === "email") {
            const rendered = await renderAlertEmail({
              event,
              ...(typeof action.subjectPrefix === "string"
                ? { subjectPrefix: action.subjectPrefix }
                : {}),
            });
            await this.emailSender.send({
              provider: action.provider,
              to: action.to,
              ...(typeof action.from === "string" ? { from: action.from } : {}),
              subject: rendered.subject,
              text: rendered.text,
              html: rendered.html,
            });
            return;
          }

          const prefix = action.prefix ? `${action.prefix} ` : "Task Health alert: ";
          await this.mainSessionPublisher.publish({
            text: `${prefix}${event.summary}`,
            wakeMode: action.wakeMode ?? "next-heartbeat",
          });
        },
        {
          attempts: retryCountForAction(action),
          baseDelayMs: 250,
          maxDelayMs: 5_000,
          factor: 2,
          jitterMs: 100,
          shouldRetry: (error, attempt) =>
            action.kind !== "main_session_prompt" &&
            attempt < retryCountForAction(action) &&
            isRetryableError(error),
        },
      );

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

export class InMemoryWebhookClient implements TaskHealthWebhookClient {
  public readonly requests: Array<{
    url: string;
    headers: Record<string, string>;
    body: string;
    timeoutMs?: number;
  }> = [];

  public async post(request: {
    url: string;
    headers: Record<string, string>;
    body: string;
    timeoutMs?: number;
  }): Promise<void> {
    this.requests.push(request);
  }
}

export class InMemoryEmailSender implements TaskHealthEmailSender {
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

export class InMemoryMainSessionPublisher implements TaskHealthMainSessionPublisher {
  public readonly messages: Array<{ text: string; wakeMode: "now" | "next-heartbeat" }> = [];

  public async publish(input: { text: string; wakeMode: "now" | "next-heartbeat" }): Promise<void> {
    this.messages.push(input);
  }
}
