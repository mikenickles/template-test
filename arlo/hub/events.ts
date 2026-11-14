import { EventEmitter } from 'node:events';

/** Everything the interface needs to stay live. Sent to clients over SSE. */
export type HubEvent =
  | { type: 'turn_start'; turnId: string }
  | { type: 'delta'; turnId: string; text: string }
  | { type: 'reset_text'; turnId: string }
  | { type: 'status'; turnId: string; text: string }
  | { type: 'message'; message: unknown }
  | { type: 'approval'; approval: unknown }
  | { type: 'turn_end'; turnId: string; error?: string }
  | { type: 'state' };

const bus = new EventEmitter();
bus.setMaxListeners(100);

export function emit(event: HubEvent): void {
  bus.emit('event', event);
}

export function subscribe(listener: (event: HubEvent) => void): () => void {
  bus.on('event', listener);
  return () => bus.off('event', listener);
}
