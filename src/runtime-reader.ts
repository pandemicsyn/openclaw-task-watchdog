import type { DetachedWorkTaskRun } from "./types.js";

export interface TaskRuntimeReader {
  listRuns(): Promise<DetachedWorkTaskRun[]>;
}

export class InMemoryTaskRuntimeReader implements TaskRuntimeReader {
  constructor(private readonly runs: DetachedWorkTaskRun[]) {}

  public async listRuns(): Promise<DetachedWorkTaskRun[]> {
    return this.runs;
  }
}
