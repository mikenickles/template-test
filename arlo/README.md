# Arlo

A warm, minimal personal agent that lives on your own computer. One conversation, a quiet menu, and a lot of care underneath: Gmail, Google Calendar, Drive, Spotify, a wallet for payments, long-term memory and scheduled routines, on Claude, OpenAI or Gemini.

The hub runs on your Windows ARM computer. A small Android app (or any phone browser) connects to it.

## Start

1. Install [Node.js](https://nodejs.org) 24 or newer (choose the ARM64 installer on a Windows ARM machine).
2. Double-click `start.cmd`. The first run installs what it needs, then opens Arlo at `http://127.0.0.1:8787`.
3. Paste one API key (Claude, OpenAI or Gemini) and tell Arlo your name. That's the whole setup.

From a terminal instead:

```bash
npm install --omit=dev
```

```bash
npm start
```

To look around with no keys and pretend accounts:

```bash
npm run demo
```

To have Arlo start when you sign in to Windows, run `scripts\autostart.ps1` once.

## Connect your accounts

Open the menu, choose **Connections**. Accounts are connected at the computer, never from the phone.

**Google (Gmail, Calendar, Drive).** Google requires you to register a small app of your own:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the Gmail API, Google Calendar API and Google Drive API.
2. Under Google Auth Platform, set the audience to External and add yourself as a test user. Then set the publishing status to "In production"; otherwise Google signs you out every 7 days. You will see an "unverified app" warning when you connect, which is expected for an app only you use.
3. Create an OAuth client of type **Desktop app**. Paste its client ID and secret into Arlo and press Connect.

Arlo asks for the least it can: read and manage mail (no permanent delete), manage the calendar, read Drive, and write only to Drive files it created itself.

**Spotify.** In the [Spotify developer dashboard](https://developer.spotify.com/dashboard), create an app using the Web API and add the redirect URI Arlo shows you (`http://127.0.0.1:8787/oauth/spotify/callback`). Paste the client ID. Spotify requires Premium for apps in development mode and for playback control, and signs you out every six months.

**Stripe.** Create a restricted key in the Stripe Dashboard with only the permissions you want Arlo to have, and paste it in. This gives Arlo your balance, recent payments, payment links and refunds.

## Paying for things

Arlo never holds or sees a card number. When you approve a payment, it requests a one-time card capped at exactly that amount. The card is shown only to you, under **Wallet**, and you finish the checkout. Payments are off until you switch them on, and every one is checked against a per-purchase and a daily limit that only you, at the computer, can change.

The one-time card comes from one of two places:

- **Your Link wallet** (personal use, US and Canada). Install Stripe's Link CLI inside this folder and sign in once. Each request is also confirmed by you in the Link app.

  ```bash
  npm install @stripe/link-cli
  ```

  ```bash
  npx link-cli auth login
  ```

- **Stripe Issuing** (business Stripe accounts with Issuing enabled). Arlo creates a single-use virtual card on your connected account.

What is not possible today: Arlo cannot type a card into a shop's checkout page for you, and it cannot buy from arbitrary shops through Stripe directly. Stripe's agent checkout protocols only work with shops that have adopted them.

## Your phone

1. In the menu choose **Phone** and switch on "Let my phone connect". Windows may ask to allow Node.js through the firewall; allow it on private networks.
2. Install the Android app (below), tap **Scan pairing code**, and scan the code Arlo shows. Any phone browser also works: open the address shown and type the code.

The app adds things a browser tab can't: "Share to Arlo" from other apps, voice input, and notifications when Arlo needs your OK or a routine has something for you. Notifications are checked about every 15 minutes, straight from your hub; no push service sees them.

**Getting the app.** Every push that touches `android/` builds it on GitHub: open the repository's Actions tab, pick the latest "Arlo Android app" run, and download `arlo-android`. To build it yourself, open `android/` in Android Studio, or run `./gradlew assembleDebug` there.

**Away from home.** Install [Tailscale](https://tailscale.com) on the computer and the phone, and use the computer's Tailscale address in the app. On your home Wi‑Fi the connection is plain HTTP, so don't use it on networks you don't trust without Tailscale. Never forward the hub's port to the internet.

## How Arlo keeps you in charge

These rules are enforced by the hub's code, not by asking the model nicely.

- **Three kinds of action.** Looking things up just happens. Small things that are easy to undo and only touch your own stuff (a draft, a label, your own calendar, the music) just happen and are mentioned. Anything that reaches other people, deletes, or spends money is shown to you as a card built from the real details, and waits for your OK. There is no "always allow" for those.
- **Other people's words are data.** Email, invitations, documents and web pages are fenced off as untrusted. Once any of it has entered a turn, even the small actions need your OK, including saving to memory. Web research is done by a separate helper that has no access to your accounts.
- **The owner's seat.** API keys, spending limits, account connections and paired phones can only be changed in a browser on the computer itself. A paired phone can chat, approve, and pause.
- **A kill switch.** "Pause Arlo" in the menu (also from the phone) stops everything in progress, declines every open request, and stops routines until you switch it back.
- **A record.** Activity lists every time Arlo used one of your accounts. Memory shows everything it carries between conversations; delete any of it, or export it.
- **Private by default.** Keys and tokens are encrypted on disk (tied to your Windows account). The hub answers only this computer until you turn phone access on, and the page cannot load anything from another site.

## What it borrows from the best personal agents

Before building this I looked at what reviewers credit and criticise in Meta's Muse, OpenClaw, Poke, ChatGPT's memory and Pulse, Gemini's agent features, Lindy and Claude Cowork. What made it in:

- One continuous conversation, with older parts folded into a summary so it never "fills up".
- A voice that is warm and specific but willing to disagree, defined in a short prompt you can add to in Settings or just by telling Arlo.
- Memory you can see, edit and export; nothing kept about you invisibly.
- Proactivity that defaults to quiet: only routines you asked for, quiet hours, a daily cap, and a routine that has nothing to say says nothing.
- Approval cards for every email and every purchase, an activity log, and layered status ("Checking your calendar").
- Accounts connected only when you need them, with the narrowest permissions that work.
- Lessons from OpenClaw's security incidents: no public exposure, pairing with one-time codes, origin and host checks, encrypted tokens, no plug-in marketplace, and approvals that cannot be talked out of by an email.

## Models

Add keys for any of Claude, OpenAI and Gemini in **Settings**. Arlo uses the first and falls back to the others if it is unavailable. Defaults are `claude-opus-5-5`, `gpt-6-astra` and `gemini-4-hydrogen`; change them in Settings. Claude requests opt in to Anthropic's refusal fallback, so a request a safety filter declines by mistake is retried on another Claude model.

## For developers

```
hub/            the hub (TypeScript, run directly by Node; no build step)
  agent/        turn loop, approvals, memory, routines, conversation storage
  providers/    Claude, OpenAI and Gemini adapters behind one interface
  tools/        Gmail, Calendar, Drive, Spotify, wallet, and the approval gate
web/            the interface (plain ES modules; served by the hub)
android/        the Android shell (Kotlin)
test/           node:test suites
```

```bash
npm install
```

```bash
npm test
```

```bash
npm run typecheck
```

Private data lives outside this folder: `%APPDATA%\Arlo` on Windows, `~/.arlo` elsewhere. Set `ARLO_DATA_DIR` or `ARLO_PORT` to change the location or the port.
