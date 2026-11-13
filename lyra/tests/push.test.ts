import { generateKeyPairSync, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Lyra } from "../core/lyra.ts";
import { parseGoogleServices, parseServiceAccount, signedAssertion } from "../core/push.ts";
import { memStores, platform } from "./helpers.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

const services = (pkg = "app.lyra.chief", project = "lyra-mine") =>
  JSON.stringify({
    project_info: { project_number: "1234567890", project_id: project },
    client: [
      { client_info: { mobilesdk_app_id: "1:1:android:other", android_client_info: { package_name: "com.other" } }, api_key: [{ current_key: "nope" }] },
      { client_info: { mobilesdk_app_id: "1:1234567890:android:abc", android_client_info: { package_name: pkg } }, api_key: [{ current_key: "AIzaExample" }] },
    ],
  });
const account = (project = "lyra-mine") => JSON.stringify({ type: "service_account", project_id: project, client_email: "push@lyra-mine.iam.gserviceaccount.com", private_key: PEM });

/** Google's token and push endpoints, in memory. */
function fakeGoogle(gone: string[] = []) {
  const sent: { token: string; title: string; body: string; hash: string; channel: string }[] = [];
  let tokens = 0;
  const fetch = (async (url: string, init: RequestInit) => {
    if (url === "https://oauth2.googleapis.com/token") {
      tokens++;
      return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }), { status: 200 });
    }
    if (url === "https://fcm.googleapis.com/v1/projects/lyra-mine/messages:send") {
      if ((init.headers as Record<string, string>).Authorization !== "Bearer ya29.test") return new Response("{}", { status: 401 });
      const m = (JSON.parse(String(init.body)) as { message: { token: string; notification: { title: string; body: string }; data: { hash: string }; android: { notification: { channel_id: string } } } }).message;
      if (gone.includes(m.token)) return new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 });
      sent.push({ token: m.token, title: m.notification.title, body: m.notification.body, hash: m.data.hash, channel: m.android.notification.channel_id });
      return new Response("{}", { status: 200 });
    }
    return new Response("unexpected", { status: 500 });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, sent, tokenCalls: () => tokens };
}

describe("push from the home base", () => {
  it("reads the two Firebase files, and says what's wrong with the wrong ones", () => {
    expect(parseGoogleServices(services(), "app.lyra.chief")).toEqual({ projectId: "lyra-mine", senderId: "1234567890", appId: "1:1234567890:android:abc", apiKey: "AIzaExample" });
    expect(() => parseGoogleServices(services("com.someone.else"), "app.lyra.chief")).toThrow(/package name app\.lyra\.chief/);
    expect(() => parseGoogleServices(account(), "app.lyra.chief")).toThrow(/isn't a google-services\.json/);
    expect(() => parseGoogleServices("not json", "app.lyra.chief")).toThrow(/google-services\.json/);
    expect(parseServiceAccount(account())).toMatchObject({ projectId: "lyra-mine", clientEmail: "push@lyra-mine.iam.gserviceaccount.com" });
    expect(() => parseServiceAccount(services())).toThrow(/isn't a service account key/);
  });

  it("signs a request that may only send messages", async () => {
    const jwt = await signedAssertion(parseServiceAccount(account()), Date.parse("2026-11-13T10:00:00Z"));
    const [head, body, sig] = jwt.split(".");
    const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>;
    expect(claims).toMatchObject({ iss: "push@lyra-mine.iam.gserviceaccount.com", scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token" });
    expect((claims.exp as number) - (claims.iat as number)).toBe(3600);
    expect(createVerify("RSA-SHA256").update(`${head}.${body}`).verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true);
  });

  it("rings every phone that signed up, and drops one whose address is gone", async () => {
    const g = fakeGoogle(["tok-old-phone"]);
    const stores = memStores();
    const lyra = await Lyra.start(platform({ fetch: g.fetch }, stores));
    expect(await lyra.push("Lyra", "nothing set up")).toBe(0);
    await expect(lyra.setupPush(services(), account("another-project"))).rejects.toThrow(/different Firebase projects/);
    await lyra.setupPush(services(), account());
    expect(await lyra.pushStatus()).toEqual({ configured: true, canSend: true, devices: [] });
    expect(await lyra.push("Lyra", "no phones yet")).toBe(0);

    // the phones sign up (their addresses arrive through sync)
    expect(await lyra.registerPushDevice("d1", "Phone", "tok-phone")).toBe(true);
    expect(await lyra.registerPushDevice("d1", "Phone", "tok-phone")).toBe(false);
    await lyra.registerPushDevice("d2", "Old phone", "tok-old-phone");

    expect(await lyra.push("Heads-up from Lyra", "Rowan's school closes early Friday.", "#/c/2")).toBe(1);
    expect(g.sent).toEqual([{ token: "tok-phone", title: "Heads-up from Lyra", body: "Rowan's school closes early Friday.", hash: "#/c/2", channel: "lyra_push" }]);
    expect((await lyra.pushStatus()).devices.map((d) => d.name)).toEqual(["Phone"]);
    await lyra.push("Lyra", "again");
    expect(g.tokenCalls()).toBe(1); // the sending token is reused until it runs out

    // the sending key lives with the API keys, not in the synced data or a backup
    expect(await stores.secrets.get("push.account")).toContain("PRIVATE KEY");
    expect(JSON.stringify(lyra.pushConfig())).not.toContain("PRIVATE KEY");
    await lyra.forgetPush();
    expect(await lyra.pushStatus()).toEqual({ configured: false, canSend: false, devices: [] });
    expect(await lyra.push("Lyra", "off")).toBe(0);
  });
});
