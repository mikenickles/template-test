/**
 * The UI's way into Lyra. Everything runs on the phone: this file starts the
 * engine once and exposes the same calls the screens have always used.
 */
import { App as CapApp } from "@capacitor/app";
import type { ChannelSummary, MemoryNote as CoreNote, StoredMessage } from "../../core/db";
import {
  Lyra,
  type AppState as CoreState,
  type ChannelInput,
  type ChannelView as CoreChannelView,
  type MemoryView as CoreMemory,
  type SettingsPatch,
} from "../../core/lyra";
import { createPlatform, isNative } from "./platform";

export type MemoryNote = CoreNote;
export type Message = StoredMessage;
export type AppState = CoreState;
export type MemoryView = CoreMemory;
export type ConnectorStatus = CoreState["connectors"][number];
export type ProviderInfo = CoreState["providers"][number];
export type Channel = ChannelSummary;
export type ChannelView = CoreChannelView;
export { isNative };

const ready: Promise<Lyra> = createPlatform().then(async (p) => {
  const lyra = await Lyra.start(p);
  // Save to disk whenever the app leaves the screen.
  if (isNative) void CapApp.addListener("pause", () => void lyra.flush());
  addEventListener("pagehide", () => void lyra.flush());
  return lyra;
});

export const api = {
  state: async () => (await ready).state(),
  messages: async (channelId: number | null, before?: number) => ({ messages: (await ready).messages(channelId, before) }),
  stop: async () => (await ready).stop(),
  memory: async () => (await ready).memoryView(),
  saveMemory: async (content: string) => (await ready).saveMemory(content),
  restoreMemory: async (id: number) => (await ready).restoreMemory(id),
  note: async (messageId: number, index: number, action: "undo" | "accept" | "dismiss") => ({
    message: await (await ready).note(messageId, index, action),
  }),
  saveSettings: async (patch: SettingsPatch) => (await ready).saveSettings(patch),
  channels: async () => (await ready).channels(),
  createChannel: async (input: ChannelInput) => (await ready).createChannel(input),
  updateChannel: async (id: number, input: Partial<ChannelInput>) => (await ready).updateChannel(id, input),
  deleteChannel: async (id: number) => (await ready).deleteChannel(id),
  channelView: async (id: number) => (await ready).channelView(id),
  saveChannelNotebook: async (id: number, content: string) => (await ready).saveChannelNotebook(id, content),
  restoreChannelNotebook: async (id: number, snapshotId: number) => (await ready).restoreChannelNotebook(id, snapshotId),
  connectGmail: async () => (await ready).connectGmail(),
  disconnectGmail: async () => (await ready).disconnectGmail(),
};

export interface StreamHandlers {
  text(d: string): void;
  status(label: string): void;
  memory(note: MemoryNote): void;
  done(message: Message, user?: Message): void;
}

/** Send a message; Lyra's reply arrives through the handlers as it's written. */
export async function sendChat(text: string, h: StreamHandlers, channelId: number | null = null): Promise<void> {
  const { message, user } = await (await ready).chat(text, { text: h.text, status: h.status, memory: h.memory }, channelId);
  h.done(message, user);
}
