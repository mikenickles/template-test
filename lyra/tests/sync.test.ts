import { describe, expect, it } from "vitest";
import { Lyra } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import { readSyncState, Sync, type SnapshotInfo, type SyncRemote } from "../core/sync.ts";
import { memStores, platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const PASS = "correct horse battery";

/** Lyra's hidden Drive folder, in memory. */
function fakeDrive() {
  const files = new Map<string, { info: SnapshotInfo; bytes: Uint8Array }>();
  let n = 0;
  const remote: SyncRemote = {
    list: async () => [...files.values()].map((f) => f.info),
    download: async (id) => files.get(id)!.bytes,
    upload: async (bytes, info) => {
      const full = { ...info, id: `f${++n}` };
      files.set(full.id, { info: full, bytes });
      return full;
    },
    remove: async (id) => void files.delete(id),
  };
  return { remote, files };
}

/** A device: its own storage, an engine, and its sync. `restart()` is the app reloading. */
async function device(name: string, drive: ReturnType<typeof fakeDrive>) {
  const stores = memStores();
  const d = {
    stores,
    lyra: undefined as unknown as Lyra,
    sync: undefined as unknown as Sync,
    async restart() {
      const state = await readSyncState(stores.texts, name);
      d.lyra = await Lyra.start(platform({ provider: new FakeProvider() }, stores), { resumeWorkers: !state.justPulled });
      d.sync = new Sync(d.lyra, drive.remote, stores.texts, stores.secrets, state);
      await d.sync.started();
    },
    texts: () => d.lyra.messages(null).map((m) => m.content),
  };
  await d.restart();
  return d;
}

describe("hand-off sync", () => {
  it("sets up from the phone, joins from the laptop, and hands changes back and forth", async () => {
    const drive = fakeDrive();
    const phone = await device("Phone", drive);
    await phone.lyra.saveSettings({ userName: "Mike" });
    await phone.lyra.chat("Remember the gate code is 4412", noop);
    expect(await phone.sync.enable(PASS, "Phone")).toBe("pushed");
    expect(drive.files.size).toBe(1);

    const laptop = await device("Laptop", drive);
    await expect(laptop.sync.enable("wrong passphrase", "Laptop")).rejects.toThrow(/passphrase/);
    expect(laptop.sync.state.enabled).toBe(false);
    expect(await laptop.sync.enable(PASS, "Laptop")).toBe("pulled");
    await laptop.restart();
    expect(laptop.lyra.state().userName).toBe("Mike");
    expect(laptop.texts()[0]).toContain("gate code");
    expect(await laptop.sync.check()).toBe("up-to-date");

    // a change on the laptop reaches the phone
    await laptop.lyra.chat("Hello from the laptop", noop);
    expect(laptop.sync.state.dirty).toBe(true);
    expect(await laptop.sync.check()).toBe("pushed");
    expect(await phone.sync.check(false)).toBe("busy"); // not while you're in the middle of something
    expect(await phone.sync.check()).toBe("pulled");
    await phone.restart();
    expect(phone.texts()).toContain("Hello from the laptop");
    expect(await phone.sync.check()).toBe("up-to-date");

    // and back again
    await phone.lyra.chat("Back on the phone", noop);
    expect(await phone.sync.check()).toBe("pushed");
    expect(await laptop.sync.check()).toBe("pulled");
    await laptop.restart();
    expect(laptop.texts()).toContain("Back on the phone");
  });

  it("asks when both changed, and keeps the side not chosen", async () => {
    const drive = fakeDrive();
    const phone = await device("Phone", drive);
    await phone.sync.enable(PASS, "Phone");
    const laptop = await device("Laptop", drive);
    await laptop.sync.enable(PASS, "Laptop");
    await laptop.restart();

    await phone.lyra.chat("Phone while apart", noop);
    await laptop.lyra.chat("Laptop while apart", noop);
    expect(await laptop.sync.check()).toBe("pushed");
    expect(await phone.sync.check()).toBe("conflict");
    expect(phone.sync.state.conflict?.deviceName).toBe("Laptop");

    expect(await phone.sync.resolve("other")).toBe("pulled");
    await phone.restart();
    expect(phone.texts()).toContain("Laptop while apart");
    expect(phone.texts()).not.toContain("Phone while apart");
    const kinds = [...drive.files.values()].map((f) => f.info.kind);
    expect(kinds).toContain("conflict"); // the phone's side, saved just in case

    // keeping this side instead: the laptop's next check loads it
    await phone.lyra.chat("Phone again", noop);
    await laptop.lyra.chat("Laptop again", noop);
    expect(await phone.sync.check()).toBe("pushed");
    expect(await laptop.sync.check()).toBe("conflict");
    expect(await laptop.sync.resolve("this")).toBe("pushed");
    expect(await phone.sync.check()).toBe("pulled");
    await phone.restart();
    expect(phone.texts()).toContain("Laptop again");
  });

  it("keeps each device's own Google sign-ins and lock, and doesn't resume the other device's workers", async () => {
    const drive = fakeDrive();
    const phone = await device("Phone", drive);
    await phone.lyra.connectGoogle("gmail");
    await phone.lyra.saveSettings({ appLock: true, accent: "navy" });
    await phone.sync.enable(PASS, "Phone");
    const laptop = await device("Laptop", drive);
    await laptop.sync.enable(PASS, "Laptop");
    await laptop.restart();
    expect(laptop.lyra.state().accent).toBe("navy"); // shared
    expect(laptop.lyra.state().appLock).toBe(false); // the phone's own
    expect(laptop.lyra.state().connectors.find((c) => c.id === "gmail")?.state).toBe("not_connected");

    await laptop.lyra.saveSettings({ accent: "teal" });
    await laptop.sync.check();
    await phone.sync.check();
    await phone.restart();
    expect(phone.lyra.state().accent).toBe("teal");
    expect(phone.lyra.state().appLock).toBe(true);
    expect(phone.lyra.state().connectors.find((c) => c.id === "gmail")?.state).toBe("connected");
  });

  it("keeps changes made just before the app closed, and only the newest ten snapshots", async () => {
    const drive = fakeDrive();
    const phone = await device("Phone", drive);
    await phone.sync.enable(PASS, "Phone");
    await phone.lyra.chat("Typed, then the app closed", noop);
    await phone.lyra.flush();
    await phone.restart();
    expect(phone.sync.state.dirty).toBe(true);
    for (let i = 0; i < 12; i++) {
      await phone.lyra.saveSettings({ userName: `Mike ${i}` });
      await phone.sync.check();
    }
    expect([...drive.files.values()].filter((f) => f.info.kind !== "conflict").length).toBe(10);
  });
});

describe("Drive sync folder", () => {
  it("lists, uploads into the hidden app folder, retries an expired token once, and downloads", async () => {
    const { DriveSyncRemote } = await import("../core/sync-drive.ts");
    const { DRIVE_APPDATA } = await import("../core/connectors/google.ts");
    const calls: { url: string; init?: RequestInit }[] = [];
    let first = true;
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("uploadType=multipart")) return new Response(JSON.stringify({ id: "new1" }));
      if (url.includes("alt=media")) return new Response(new Uint8Array([1, 2, 3]));
      if (first) {
        first = false;
        return new Response("expired", { status: 401 });
      }
      return new Response(JSON.stringify({ files: [{ id: "a", appProperties: { rev: "3", device: "d", deviceName: "Phone", savedAt: "2026-11-12T10:00:00Z", kind: "snapshot" } }, { id: "junk" }] }));
    }) as typeof fetch;
    const auth = { available: true, authorize: async () => ({ accessToken: "tok", grantedScopes: [DRIVE_APPDATA] }) };
    const remote = new DriveSyncRemote(auth, fetchFn);

    const list = await remote.list();
    expect(list).toEqual([{ id: "a", rev: 3, device: "d", deviceName: "Phone", savedAt: "2026-11-12T10:00:00Z", kind: "snapshot" }]);
    expect(calls[0].url).toContain("spaces=appDataFolder");
    expect(calls.length).toBe(2); // the 401, then the retry

    const made = await remote.upload(new Uint8Array([9, 9]), { rev: 4, device: "d", deviceName: "Laptop", savedAt: "x", kind: "snapshot" });
    expect(made.id).toBe("new1");
    const up = calls[calls.length - 1];
    const body = await new Response(up.init!.body as Blob).text();
    expect(body).toContain('"parents":["appDataFolder"]');
    expect(body).toContain('"rev":"4"');
    expect((up.init!.headers as Record<string, string>).Authorization).toBe("Bearer tok");

    expect([...(await remote.download("a"))]).toEqual([1, 2, 3]);
  });
});
