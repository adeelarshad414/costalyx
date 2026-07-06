import type { BillingAgentEvent } from './billing-agent.types';

export const BILLING_AGENT_EVENT_PUBLISHER = Symbol('BILLING_AGENT_EVENT_PUBLISHER');
export const BILLING_AGENT_EVENT_TOPIC = 'costalyx.billing-agent';

export interface BillingAgentEventPublisher {
  publish(topic: string, event: BillingAgentEvent): Promise<void>;
}

export class InMemoryBillingAgentEventPublisher implements BillingAgentEventPublisher {
  readonly events: Array<{ topic: string; event: BillingAgentEvent }> = [];

  async publish(topic: string, event: BillingAgentEvent): Promise<void> {
    this.events.push({ topic, event });
  }
}
