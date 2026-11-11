import { describe, expect, it } from "vitest";
import { DB, listMessages, MIGRATIONS } from "../core/db.ts";
import { Lyra } from "../core/lyra.ts";
import { memStores, platform, SQL } from "./helpers.ts";

describe("upgrading a Phase 1 install", () => {
  it("keeps the old chat as the main chat and adds channels", async () => {
    // a database exactly as Phase 1 left it
    const old = new SQL.Database();
    old.exec(MIGRATIONS[0]);
    old.run("PRAGMA user_version = 1");
    old.run("INSERT INTO messages (role, content) VALUES ('user', 'Remember the dentist'), ('assistant', 'Got it.')");
    old.run("INSERT INTO memory_snapshots (content, reason) VALUES ('# old', 'Saved to Rules: x')");
    const stores = memStores();
    await stores.blobs.write("lyra.db", old.export());

    const db = await DB.open(SQL, stores.blobs);
    expect(listMessages(db, null).map((m) => [m.content, m.channel_id])).toEqual([
      ["Remember the dentist", null],
      ["Got it.", null],
    ]);
    expect(db.get<{ v: number }>("SELECT user_version AS v FROM pragma_user_version")?.v).toBe(MIGRATIONS.length);

    const lyra = await Lyra.start(platform({}, stores));
    expect(lyra.memoryView().history.map((h) => h.reason)).toEqual(["Saved to Rules: x"]);
    const home = await lyra.createChannel({ name: "Home" });
    expect(lyra.messages(home.id)).toEqual([]);
    expect(lyra.messages(null)).toHaveLength(2);
  });
});
