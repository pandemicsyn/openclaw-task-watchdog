import type {
  TaskHealthMainSessionPublisher,
  TaskHealthMainSessionPublisherInput,
} from "./types.js";

export type MainSessionEventSender = (input: {
  text: string;
  mode: "now" | "next-heartbeat";
}) => Promise<void>;

export class SystemEventMainSessionPublisher implements TaskHealthMainSessionPublisher {
  constructor(private readonly sendSystemEvent: MainSessionEventSender) {}

  public async publish(input: TaskHealthMainSessionPublisherInput): Promise<void> {
    await this.sendSystemEvent({
      text: input.text,
      mode: input.wakeMode,
    });
  }
}
