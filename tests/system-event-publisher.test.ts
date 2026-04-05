import { describe, expect, it } from "vitest";

import { publishMainSessionEvent } from "../src/system-event-publisher.js";

describe("publishMainSessionEvent", () => {
  it("enqueues event and requests heartbeat for now mode", async () => {
    const calls: {
      text?: string;
      sessionKey?: string;
      heartbeatNow?: boolean;
      heartbeatOnce?: boolean;
    } = {};
    const api = {
      runtime: {
        system: {
          enqueueSystemEvent: (text: string, opts: { sessionKey: string }) => {
            calls.text = text;
            calls.sessionKey = opts.sessionKey;
            return true;
          },
          requestHeartbeatNow: () => {
            calls.heartbeatNow = true;
          },
          runHeartbeatOnce: async (_opts: unknown) => {
            calls.heartbeatOnce = true;
            return { status: "ok" };
          },
        },
      },
    };

    await publishMainSessionEvent(api as never, { text: "hello", mode: "now" });

    expect(calls.text).toBe("hello");
    expect(calls.sessionKey).toBe("main");
    expect(calls.heartbeatOnce).toBe(true);
  });
});
