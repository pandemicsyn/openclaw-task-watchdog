import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";

export async function publishMainSessionEvent(
  api: OpenClawPluginApi,
  input: { text: string; mode: "now" | "next-heartbeat" },
): Promise<void> {
  api.runtime.system.enqueueSystemEvent(input.text, {
    sessionKey: "main",
  });

  if (input.mode === "now") {
    api.runtime.system.requestHeartbeatNow();
  }
}
