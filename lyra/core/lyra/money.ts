/** Money connections: bank accounts (SimpleFIN) and YNAB. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import { claim as claimBank, type Http } from "../connectors/money/simplefin.ts";
import { checkToken as checkYnabToken } from "../connectors/money/ynab.ts";
import { type AppState } from "./shared.ts";
import { part } from "./part.ts";

export const money = part({
  /** native request when the platform has one (SimpleFIN doesn't answer web views), else fetch */
  get http(): Http {
    return (
      this.p.http ??
      (async (url, init) => {
        const r = await this.fetch(url, { method: init.method, headers: init.headers, body: init.body });
        return { status: r.status, text: await r.text() };
      })
    );
  },

  async connectBank(setupToken: string): Promise<AppState> {
    const access = await claimBank(setupToken, this.http);
    await this.p.secrets.set("bank.access", access);
    this.money.bank = true;
    this.bankCache.forget();
    await this.connectors.reset();
    return this.state();
  },

  async disconnectBank(): Promise<AppState> {
    await this.p.secrets.remove("bank.access");
    this.money.bank = false;
    this.bankCache.forget();
    await this.connectors.reset();
    return this.state();
  },

  async connectYnab(token: string): Promise<AppState> {
    await checkYnabToken(token, this.http);
    await this.p.secrets.set("ynab.token", token.trim());
    this.money.ynab = true;
    await this.connectors.reset();
    return this.state();
  },

  async disconnectYnab(): Promise<AppState> {
    await this.p.secrets.remove("ynab.token");
    this.money.ynab = false;
    await this.connectors.reset();
    return this.state();
  },
});
