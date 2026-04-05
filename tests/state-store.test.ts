import { mkdtemp, readFile } from "node:fs/promises";
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
  it("saves and loads state", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "watchdog-state-"));
    const store = createStateStore(dir);

    const state = {
      dedupe: { "a|b": 123 },
      lastSeenTaskStateByTaskId: { t1: "failed|sent" },
    };

    await store.save(logger() as never, state);
    const loaded = await store.load(logger() as never);

    expect(loaded).toEqual(state);

    const raw = await readFile(store.path, "utf8");
    expect(raw).toContain('"version": 1');
  });
});
