import type { OpenClawPluginToolContext, PluginLogger } from "openclaw/plugin-sdk/plugin-entry";

import {
  fetchTaskRunsFromRuntimeBySession,
  fetchTaskRunsFromRuntimeByToolContext,
} from "./openclaw-task-source.js";
import type { TaskHealthTaskRun } from "./types.js";

export interface TaskRuntimeReader {
  listRuns(): Promise<TaskHealthTaskRun[]>;
}

export class InMemoryTaskRuntimeReader implements TaskRuntimeReader {
  constructor(private readonly runs: TaskHealthTaskRun[]) {}

  public async listRuns(): Promise<TaskHealthTaskRun[]> {
    return this.runs;
  }
}

type RuntimeTaskRunsSurface = Parameters<typeof fetchTaskRunsFromRuntimeBySession>[1];

export class OpenClawSessionTaskRuntimeReader implements TaskRuntimeReader {
  constructor(
    private readonly logger: PluginLogger,
    private readonly runtime: RuntimeTaskRunsSurface,
    private readonly sessionKey: string,
  ) {}

  public async listRuns(): Promise<TaskHealthTaskRun[]> {
    return fetchTaskRunsFromRuntimeBySession(this.logger, this.runtime, this.sessionKey);
  }
}

export class OpenClawToolContextTaskRuntimeReader implements TaskRuntimeReader {
  constructor(
    private readonly logger: PluginLogger,
    private readonly runtime: RuntimeTaskRunsSurface,
    private readonly ctx: Pick<OpenClawPluginToolContext, "sessionKey" | "deliveryContext">,
  ) {}

  public async listRuns(): Promise<TaskHealthTaskRun[]> {
    return fetchTaskRunsFromRuntimeByToolContext(this.logger, this.runtime, this.ctx);
  }
}
