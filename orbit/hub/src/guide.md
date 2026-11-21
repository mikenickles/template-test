# The Treehouse guide

Treehouse is an app for working with a small crew of AI agents. The user chats with them in rooms on their
phone or PC, and the agents help each other and the user. It was built for this user, by Claude Code, and it
runs on the user's own devices.

## The three pieces

- **The hub** runs on the user's always-on PC (Windows, Mac or Linux). It's where everything happens: it
  calls the AI models, runs the conversations, keeps the history, and holds the API keys, the Google sign-in
  and shared folders. Conversations keep going on the PC while the phone is asleep. It starts with
  "Start Orbit" on the PC (an old name kept for the file) and can start itself when the PC starts.
- **The phone app** (Android) pairs with the hub by scanning a QR code the PC shows, or by typing the PC's
  address and a six-digit code.
- **The desktop app** is the same rooms and crew in a browser on the PC: open http://localhost:8787 (the PC's
  own Treehouse page). It can be installed as an app from Edge or Chrome.

Away from home, the phone reaches the hub through Tailscale, a free private network: install it on the PC and
the phone and sign in to both with the same account.

## Rooms

A room is a group chat between the user and some agents. Each room has a name, a description (what it's for
and rules every agent in it follows) and a mode that decides who answers:

- **Best fit** (auto): only the agents best suited to each message answer it. A quick, cheap model picks.
- **Lead**: one agent answers first and brings in the others, then gives the combined answer.
- **Round table**: every agent answers in turn.

In any mode, @mentioning an agent (like @Nova) asks just them, and replying to a message sends it to the agent
who wrote it. Agents can @mention each other to hand work over. The user can copy, retry or delete messages,
reply to one, attach photos, PDFs and text files, stop a reply, and clear a room. Long rooms are summarized
automatically so they stay affordable. Rooms can have scheduled messages (Schedules, in the room's menu): a
message posted at a set time on chosen days, which the crew then answers.

## Agents

Each agent has a name, a role, instructions, a look (one of 25 characters), and a provider and model:
Anthropic (Claude), OpenAI, xAI (Grok), Gemini, OpenRouter, Ollama (models running on the PC itself, free and
private but slower) or Demo (canned replies, for trying the app without a key). API keys are added in Settings,
under Model providers; they're checked with the provider, then kept only on the PC.

Abilities work on every real model: Claude, and OpenAI, xAI, Gemini, OpenRouter and Ollama models that support
tools (some small local models don't; those just chat). Demo agents have none.
- **Search the web**: look things up and read pages, with sources. Claude searches itself; other models search
  through a quick Claude search on the hub (it needs an Anthropic key) and read pages the hub fetches for them.
- **Run code**: calculate and work with data in a sandbox. Claude models only.
- **Read your files**: read (never change) folders the user shared from the PC's Treehouse page.
- **Remember things**: notes about the user that the whole crew shares, and the agent's own notes.
- **Build your crew**: hire new agents when the user asks, with instructions, a model and a free look.
- **Use your Google account**: search and read Gmail and save drafts (never send), read Google Calendar and add
  events, search and read Google Drive. Google is connected once, on the PC, in Settings, under Google.

**Reaches out** (Off, Gentle, Active) makes an agent proactive: see below.

Every agent knows which model it runs on and its teammates' models. Treehouse was called Orbit before, so older
messages and notes may say Orbit; it's the same app.

## What the crew knows about the user

"About you" (Settings) holds the user's name and facts every agent knows, in every room. Agents add to it as
they learn (remember_about_user) and the user can add or remove notes. The first chat, "Getting to know you",
is a guide agent (usually Nova) learning about the user, then creating a crew around them.

## Proactive agents

Agents set to Gentle (about once a day) or Active (a few times a day) look over recent chats, and the user's
calendar and email if they have Google, and write to the user only when something is worth it. A quick, cheap
model decides; usually the answer is no. Proactive agents can also:
- **follow up** later, at a time they set (follow_up),
- **watch** something on the web, like a price or a page, every hour or day, and speak up when it changes or a
  condition is met (watch, stop_watching).

One agent can write a **morning brief** at a set time, in its own room. Everything an agent writes on its own
shows under "From your crew" on Home and as a phone notification. Settings, under Proactive: who reaches out,
the morning brief, quiet hours (no check-ins then), a daily limit, and the follow-ups and watches agents have
set, which the user can cancel.

## Other things the app does

- **Notifications** when replies land while the app is closed, and for scheduled and proactive messages.
- **Share to Treehouse** from any app's share menu: send a link, text, photos or files to a room.
- **A home-screen widget** showing recent rooms.
- **Usage**: estimated spend and tokens per agent and room (Settings, Usage).
- **Updates** arrive from the user's Google Drive: the PC downloads new versions, and the user taps Update PC,
  then Update, on the phone.

## What agents can do for the user, and what only the user can do

Agents (on any real model that supports tools) can change themselves with update_self: their name, role, instructions, look, model, abilities
(not Google or files), and how often they reach out. With change_settings they can rename the room, change its
description and mode, add or remove its members, and change quiet hours, the daily limit and the morning brief.
They should do these when the user asks, and say what they changed.

Only the user can: add or remove API keys, pair or unpair devices, connect or disconnect Google, share folders
(on the PC), install updates, give an agent Google or file access, delete agents or rooms, and clear chats.
Point them to the right place: Settings on the phone or PC, or the agent's or room's edit screen.

## How it's built

- The hub is Node.js (plain JavaScript, no framework) with an HTTP API and live updates (server-sent events).
  It calls Claude through the Anthropic SDK and other providers through their OpenAI-compatible APIs. Its state
  is one JSON file in the .orbit-hub folder in the user's home folder; keys live in config.json beside it.
- The phone app is Kotlin with Jetpack Compose (Material 3). The desktop app is plain JavaScript with Preact,
  served by the hub itself.
- The design: warm, neutral colors so the agents' characters are the only real color, the Geist typeface, and
  the treehouse illustration when pairing and in empty states.
- The code is in the user's GitHub repository, in the orbit folder (the app's code name, which internal names
  keep). Claude Code builds and publishes new versions.
