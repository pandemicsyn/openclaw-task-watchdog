import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";

export async function publishMainSessionEvent(
  api: OpenClawPluginApi,
  input: { text: string; mode: "now" | "next-heartbeat" },
): Promise<void> {
  api.runtime.system.enqueueSystemEvent(input.text, {
    sessionKey: "main",
  });

  if (input.mode === "now") {
    if (typeof api.runtime.system.runHeartbeatOnce === "function") {
      await api.runtime.system.runHeartbeatOnce({
        reason: "task-watchdog:main-session-alert",
        sessionKey: "main",
        heartbeat: { target: "last" },
      });
    } else {
      api.runtime.system.requestHeartbeatNow({
        reason: "task-watchdog:main-session-alert",
      });
    }
  }
}
