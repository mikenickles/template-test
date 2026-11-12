import { describe, expect, it } from "vitest";
import { backupName, decryptBackup, encryptBackup, type BackupPayload } from "../core/backup.ts";
import { Lyra } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import { memStores, platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const PASS = "correct horse battery";

describe("backup file", () => {
  const payload: BackupPayload = { format: "lyra-backup", version: 1, createdAt: "2026-11-12T00:00:00Z", db: "AAEC", files: { "memory.md": "# Memory" } };

  it("round-trips with the right passphrase and refuses the wrong one", async () => {
    const file = await encryptBackup(payload, PASS);
    expect(new TextDecoder().decode(file).includes("Memory")).toBe(false); // nothing readable inside
    expect(await decryptBackup(file, PASS)).toEqual(payload);
    await expect(decryptBackup(file, "wrong passphrase")).rejects.toThrow(/passphrase/);
  });

  it("rejects short passphrases, other files and tampering", async () => {
    await expect(encryptBackup(payload, "short")).rejects.toThrow(/at least 8/);
    await expect(decryptBackup(new TextEncoder().encode("hello, not a backup at all, really not"), PASS)).rejects.toThrow(/isn't a Lyra backup/);
    const file = await encryptBackup(payload, PASS);
    file[file.length - 1] ^= 1;
    await expect(decryptBackup(file, PASS)).rejects.toThrow(/passphrase/);
  });

  it("names files by date", () => {
    expect(backupName(new Date(2026, 10, 2))).toBe("Lyra backup 2026-11-02.lyra");
  });
});

describe("backup and restore", () => {
  it("moves chats, channels, notebooks and the soul to another phone, without keys or Google sign-ins", async () => {
    const oldPhone = memStores();
    const a = await Lyra.start(platform({ provider: new FakeProvider() }, oldPhone));
    await a.saveSettings({ userName: "Sam", keys: { anthropic: "sk-ant-secret" }, accent: "teal" });
    await a.chat("Remember that Rowan's party is Saturday", noop);
    const rowan = await a.createChannel({ name: "Rowan", about: "Birthday" });
    await a.chat("The bounce house is booked", noop, rowan.id);
    await a.saveSoul("# Lyra's soul\n\nBe brief and kind.");
    await a.connectGoogle("gmail");
    const file = await a.backup(PASS);
    expect(new TextDecoder().decode(file).includes("sk-ant-secret")).toBe(false);

    const newPhone = memStores();
    const b = await Lyra.start(platform({ provider: new FakeProvider() }, newPhone));
    await b.chat("this phone's old chat", noop);
    await expect(b.restore(file, "wrong passphrase")).rejects.toThrow(/passphrase/);
    const result = await b.restore(file, PASS);
    expect(result).toEqual({ messages: 4, channels: 1 });

    const c = await Lyra.start(platform({ provider: new FakeProvider() }, newPhone)); // the app restarts after a restore
    const s = c.state();
    expect(s.userName).toBe("Sam");
    expect(s.accent).toBe("teal");
    expect(s.keys.anthropic).toBe(false);
    expect(s.connectors.find((x) => x.id === "gmail")?.state).toBe("not_connected");
    expect(c.messages(null).map((m) => m.content)[0]).toContain("Rowan's party");
    expect(c.messages(null).some((m) => m.content.includes("old chat"))).toBe(false);
    expect(c.channels().map((x) => x.name)).toEqual(["Rowan"]);
    expect(c.messages(rowan.id)[0].content).toBe("The bounce house is booked");
    expect(c.memoryView().content).toContain("Rowan's party");
    expect((await c.soul()).content).toContain("Be brief and kind.");
  });
});

describe("message actions", () => {
  it("pins, unpins and deletes messages", async () => {
    const lyra = await Lyra.start(platform({ provider: new FakeProvider() }));
    await lyra.chat("Gate code is 4412", noop);
    const [user, reply] = lyra.messages(null);
    await lyra.pinMessage(user.id, true);
    expect(lyra.pinned(null).map((m) => m.id)).toEqual([user.id]);
    await lyra.pinMessage(user.id, false);
    expect(lyra.pinned(null)).toEqual([]);
    await lyra.deleteMessage(reply.id);
    expect(lyra.messages(null).map((m) => m.id)).toEqual([user.id]);
  });
});
