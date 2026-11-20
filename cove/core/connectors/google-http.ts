import { NeedsConsentError, type TokenSource } from "./google.ts";

/** Marks errors that mean "sign in again"; the registry turns these into a reconnect prompt. */
export const AUTH_EXPIRED = "AUTH_EXPIRED";

export type Params = Record<string, string | number | boolean | string[] | undefined>;

/**
 * GET requests to a Google API with a short-lived token. On a 401 it asks
 * for a fresh token once; if that fails too, the user has to reconnect.
 */
export function googleGet(base: string, service: string, tokens: TokenSource, fetchFn: typeof fetch = fetch) {
  async function request(path: string, params: Params = {}): Promise<Response> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      for (const item of Array.isArray(v) ? v : [v]) q.append(k, String(item));
    }
    const url = `${base}${path}${q.size ? `?${q}` : ""}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      let token: string;
      try {
        token = await tokens.get();
      } catch (e) {
        if (e instanceof NeedsConsentError) throw new Error(`${AUTH_EXPIRED}: ${e.message}`);
        throw e;
      }
      const res = await fetchFn(url, { headers: { authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        await tokens.invalidate();
        if (attempt === 0) continue;
        throw new Error(`${AUTH_EXPIRED}: ${service} refused the sign-in.`);
      }
      if (!res.ok) throw new Error(`${service} said ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return res;
    }
    throw new Error(`${AUTH_EXPIRED}: ${service} refused the sign-in.`);
  }
  return {
    json: async <T>(path: string, params?: Params) => (await (await request(path, params)).json()) as T,
    text: async (path: string, params?: Params) => (await request(path, params)).text(),
  };
}
