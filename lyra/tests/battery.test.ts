import { describe, expect, it } from "vitest";
import { DB, getSetting, setSetting } from "../core/db.ts";
import { SQL } from "./helpers.ts";

describe("quiet stamps (0.53.2)", () => {
  it("saves check stamps without telling sync, but real settings still do", async () => {
    const db = await DB.open(SQL);
    let writes = 0;
    db.onWrite = () => writes++;
    setSetting(db, "mailWatchAt", "1");
    setSetting(db, "headsUpAt", "2");
    setSetting(db, "trigger.seen.4", "x");
    expect(writes).toBe(0);
    expect(getSetting(db, "headsUpAt")).toBe("2");
    setSetting(db, "accent", "moss");
    expect(writes).toBe(1);
  });
});
