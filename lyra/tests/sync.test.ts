import { describe, expect, it } from "vitest";
import { Lyra } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import { HOME_STALE_MS, readSyncState, Sync, type HomeBeat, type SeenMark, type SnapshotInfo, type SyncRemote } from "../core/sync.ts";
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
    home: async () => box.home,
    setHome: async (b) => void (box.home = b ?? undefined),
    seen: async () => [...box.marks.values()],
    markSeen: async (m) => void box.marks.set(m.device, m),
  };
  const box: { remote: SyncRemote; files: typeof files; home?: HomeBeat; marks: Map<string, SeenMark> } = { remote, files, marks: new Map() };
  return box;
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

  it("a home base does the background work; the phone leaves it alone and takes over when it goes quiet", async () => {
    const drive = fakeDrive();
    const phone = await device("Phone", drive);
    await phone.sync.enable(PASS, "Phone");
    const laptop = await device("Laptop", drive);
    await laptop.sync.enable(PASS, "Laptop");
    await laptop.restart();
    // no home base: the phone does the work, the computer doesn't (as before)
    expect([phone.sync.runsJobs(true), laptop.sync.runsJobs(false)]).toEqual([true, false]);

    const t0 = new Date("2026-11-13T10:00:00Z");
    await laptop.sync.setHome(true, t0);
    expect(laptop.sync.runsJobs(false, t0.getTime())).toBe(true);
    await phone.sync.check();
    expect(phone.sync.state.homeBeat).toMatchObject({ deviceName: "Laptop" });
    expect(phone.sync.runsJobs(true, t0.getTime() + 60_000)).toBe(false);
    // the laptop goes quiet (lid shut, no network): the phone takes the work back
    expect(phone.sync.runsJobs(true, t0.getTime() + HOME_STALE_MS + 1)).toBe(true);
    // it comes back and says so
    await laptop.sync.beat(new Date(t0.getTime() + HOME_STALE_MS + 60_000));
    await phone.sync.check();
    expect(phone.sync.runsJobs(true, t0.getTime() + HOME_STALE_MS + 120_000)).toBe(false);
    // turning it off hands the work back to the phone
    await laptop.sync.setHome(false);
    await phone.sync.check();
    expect([phone.sync.runsJobs(true), laptop.sync.runsJobs(false)]).toEqual([true, false]);
  });

  it("the home base holds its work while the phone is in use, and never waits on someone to settle a conflict", async () => {
    const drive = fakeDrive();
    const phone = await device("Phone", drive);
    await phone.sync.enable(PASS, "Phone");
    const laptop = await device("Laptop", drive);
    await laptop.sync.enable(PASS, "Laptop");
    await laptop.restart();
    await laptop.sync.setHome(true);

    // you chat on the phone; it saves
    await phone.lyra.chat("Remember the plumber comes Tuesday", noop);
    await phone.sync.check();
    // meanwhile the laptop posted something on its own, without having seen that
    await laptop.lyra.saveDoc(null, { title: "Made on the laptop", body: "A heads-up's notes" });
    expect(await laptop.sync.check()).toBe("pulled");
    expect(laptop.sync.state.conflict).toBeUndefined();
    await laptop.restart();
    // the phone's side won; the laptop's own change is kept as a conflict copy, not lost
    expect(laptop.texts().join(" ")).toContain("plumber comes Tuesday");
    expect(laptop.lyra.docs()).toHaveLength(0);
    expect([...drive.files.values()].filter((f) => f.info.kind === "conflict")).toHaveLength(1);
    // right after the phone saved, the home base waits before doing its own work
    expect(laptop.sync.othersActive()).toBe(false); // (fresh engine: nothing seen yet)
    await laptop.sync.check();
    expect(laptop.sync.othersActive()).toBe(true);
    expect(laptop.sync.othersActive(Date.now() + 120_000)).toBe(false);
    // a phone with changes of its own still asks, as before
    await laptop.lyra.saveDoc(null, { title: "Later", body: "x" });
    await laptop.sync.check();
    await phone.lyra.saveDoc(null, { title: "Phone doc", body: "y" });
    expect(await phone.sync.check()).toBe("conflict");
  });

  it("lists what Lyra posted unasked since a message, for telling a device that just caught up", async () => {
    const d = await device("Phone", fakeDrive());
    await d.lyra.chat("hello", noop);
    const after = d.lyra.lastMessageId();
    const db = (d.lyra as unknown as { db: { run(sql: string, p: unknown[]): void } }).db;
    const add = (content: string, meta: object, channel: number | null = null) =>
      db.run("INSERT INTO messages (channel_id, role, content, meta) VALUES (?, 'assistant', ?, ?)", [channel, content, JSON.stringify(meta)]);
    add("**School** closes early Friday.\nMore below", { routine: { id: 1, name: "School check" } });
    add("Your flight moved to 9:40.", { headsUp: true });
    add("A normal reply", {});
    add("PG&E is due Friday", { lifeAdmin: { ids: [1] } });
    expect(d.lyra.ownPostsSince(after).map((p) => [p.title, p.body])).toEqual([
      ["School check", "School closes early Friday."],
      ["Heads-up from Lyra", "Your flight moved to 9:40."],
    ]);
    expect(d.lyra.ownPostsSince(d.lyra.lastMessageId())).toEqual([]);
  });

  it("an idle minute changes nothing, so there's nothing new to sync", async () => {
    const d = await device("Phone", fakeDrive());
    await d.lyra.chat("hello", noop);
    await d.lyra.saveSettings({ proactive: { level: "off" } });
    let changes = 0;
    d.lyra.onDataChange(() => changes++);
    for (let i = 0; i < 3; i++) d.lyra.tickRoutines(new Date(Date.now() + i * 60_000));
    await d.lyra.routinesRunner.settle();
    expect(changes).toBe(0);
  });

  it("the home base knows when a phone has caught up, and steps down at once if another computer takes over", async () => {
    const drive = fakeDrive();
    const phone = await device("Phone", drive);
    await phone.sync.enable(PASS, "Phone");
    const laptop = await device("Laptop", drive);
    await laptop.sync.enable(PASS, "Laptop");
    await laptop.restart();
    await laptop.sync.setHome(true);

    // a reminder made on the laptop just now: the phone hasn't synced since, so it doesn't have it
    const made = new Date().toISOString();
    await laptop.sync.check();
    expect(laptop.sync.caughtUpSince(made)).toBe(false);
    // the phone syncs half a minute later and says so; now it has it (and schedules its own notification)
    drive.marks.set(phone.sync.state.device, { device: phone.sync.state.device, deviceName: "Phone", at: new Date(Date.now() + 30_000).toISOString() });
    await laptop.sync.check();
    expect(laptop.sync.caughtUpSince(made)).toBe(true);
    expect(laptop.sync.caughtUpSince(new Date(Date.now() + 3600_000).toISOString())).toBe(false);
    // a phone's own check leaves its mark; the home base's doesn't
    drive.marks.clear();
    await phone.restart(); // (a mark is left at most once a minute)
    await phone.sync.check();
    expect([...drive.marks.keys()]).toEqual([phone.sync.state.device]);

    // a second computer takes the job: the first one stops at its very next check, not minutes later
    const desk = await device("Desktop", drive);
    await desk.sync.enable(PASS, "Desktop");
    await desk.restart();
    await desk.sync.setHome(true);
    await laptop.sync.check();
    expect(laptop.sync.state.home).toBe(false);
    expect(laptop.sync.runsJobs(false)).toBe(false);
  });
});
