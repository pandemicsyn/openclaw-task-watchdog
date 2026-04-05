import type { DetachedWorkMainSessionPublisher, DetachedWorkMainSessionPublisherInput } from "./types.js";

export type MainSessionEventSender = (input: {
  text: string;
  mode: "now" | "next-heartbeat";
}) => Promise<void>;

export class SystemEventMainSessionPublisher implements DetachedWorkMainSessionPublisher {
  constructor(private readonly sendSystemEvent: MainSessionEventSender) {}

  public async publish(input: DetachedWorkMainSessionPublisherInput): Promise<void> {
    await this.sendSystemEvent({
      text: input.text,
      mode: input.wakeMode,
    });
  }
}
