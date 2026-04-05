import { describe, expect, it } from "vitest";

import { parsePluginConfig } from "../src/plugin-config.js";

describe("parsePluginConfig", () => {
  it("applies defaults", () => {
    const cfg = parsePluginConfig({});
    expect(cfg.enabled).toBe(true);
    expect(cfg.pollIntervalMs).toBe(60_000);
    expect(Array.isArray(cfg.detachedWork.rules)).toBe(true);
  });

  it("rejects unknown keys", () => {
    expect(() => parsePluginConfig({ nope: true })).toThrowError();
  });
});
