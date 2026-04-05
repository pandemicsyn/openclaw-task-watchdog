import type { DetachedWorkWebhookClient, DetachedWorkWebhookRequest } from "./types.js";

export class FetchWebhookClient implements DetachedWorkWebhookClient {
  public async post(request: DetachedWorkWebhookRequest): Promise<void> {
    const controller = new AbortController();
    const timeout =
      typeof request.timeoutMs === "number"
        ? setTimeout(() => controller.abort(), request.timeoutMs)
        : undefined;

    try {
      const response = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Webhook request failed (${response.status}): ${body}`);
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
