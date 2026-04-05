import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createStateStore } from "../src/state-store.js";

function logger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

describe("state store", () => {
  it("saves and loads v2 state", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "watchdog-state-"));
    const store = createStateStore(dir);

    const state = {
      dedupe: { "a|b": 123 },
      lastSeenTaskStateByTaskKey: { "t1|r1": "failed|delivered" },
      recentIncidents: [],
    };

    await store.save(logger() as never, state);
    const loaded = await store.load(logger() as never);

    expect(loaded).toEqual(state);

    const raw = await readFile(store.path, "utf8");
    expect(raw).toContain('"version": 2');
  });

  it("migrates legacy v1 state on load", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "watchdog-state-legacy-"));
    const store = createStateStore(dir);
    await mkdir(path.dirname(store.path), { recursive: true });
    await writeFile(
      store.path,
      JSON.stringify({
        version: 1,
        state: {
          dedupe: { abc: 1 },
          lastSeenTaskStateByTaskId: { t1: "failed|failed" },
        },
      }),
    );

    const loaded = await store.load(logger() as never);
    expect(loaded.lastSeenTaskStateByTaskKey.t1).toBe("failed|failed");
    expect(loaded.recentIncidents).toEqual([]);
  });
});
