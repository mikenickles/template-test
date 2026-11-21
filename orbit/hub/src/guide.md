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

A room is a group chat between the user and some agents. To make one, tap New room on Home (the + beside
Rooms on the PC). The quickest way is **Describe it** at the top: the user says what the room is for and who
should be in it, in their own words (or out loud with the keyboard's mic), and Treehouse picks the name, the
agents, the mode and a description, then opens the room. Or they fill in the form themselves. Agents can also
make a room when the user asks (create_room), which shows as a "New room ready" card in the chat.

To delete a room: long-press it on Home and choose Delete room, or use Delete room in the room's ⋮ menu (on
the PC, the trash button that shows when the pointer is over a room in the list, or the room's ⋯ menu). It asks
first. The room's chat and schedules go with it; its agents stay in the crew. Each room has a name, a description (what it's for
and rules every agent in it follows) and a mode that decides who answers:

- **Best fit** (auto): only the agents best suited to each message answer it. A quick, cheap model picks.
- **Lead**: one agent answers first and brings in the others, then gives the combined answer.
- **Round table**: every agent answers in turn.

In any mode, @mentioning an agent (like @Nova) asks just them, and replying to a message sends it to the agent
who wrote it. The mic button in the message box turns speech into text (the phone's voice typing; on the PC,
the browser's, in Edge or Chrome). While the box is empty, quick suggestions sit above it: "Summarize so far"
and "What's next?" send right away, and an @mention of a member who hasn't spoken lately starts a message to
them. The steps an agent took (searches, pages, files) fold into one small line under its name once it has
answered; tapping it shows them all. Each agent's model shows as a small tag on its first reply.
Chats are grouped: a run of messages from one agent shows its face and name once, with the time beside the
name, and "Today", "Yesterday" or the date marks where each day starts. Scrolled back, the Latest button says
how many new replies arrived.

The room's ⋮ menu is a sheet: Edit room, Members, Schedules, Search this room, Tokens, Clear chat and Delete room.
Tapping the faces at the top of a room (or Members) shows who's in it, each one's model and what they're
doing; Message starts a message to one of them, and Add puts someone else from the crew in the room. Agents can @mention each other to hand work over. The user can copy, retry or delete messages,
reply to one, attach photos, PDFs and text files, stop a reply, and clear a room. Long rooms are summarized
automatically so they stay affordable. Rooms can have scheduled messages (Schedules, in the room's menu): a
message posted at a set time on chosen days, which the crew then answers.

Cards: when an agent uses Google or sets a follow-up, what it found or did shows as a card in its reply, in
its own colors, right where it happened in the text. A look at the calendar is a day card (times, the next
event highlighted with how soon it is, and the free time between events); an event it added, emails it found
(tap one to open it in Gmail), a draft it saved (Open in Gmail, where the user sends it), Drive files (tap to
open), and a follow-up or watch it set (with Cancel or Stop watching). Agents don't need to repeat what a card
shows; a short sentence around it is enough.

Token counts: a small chip at the top of a room (like "12K") is about how many tokens each reply there sends.
Tapping it, or Tokens in the room's menu, opens the room's Tokens page: what that number is made of (the agent's
instructions and what it knows about the user, the summary of older messages, recent messages word for word,
photos), the room's last 30 days (tokens sent and written, how much came from the cache, estimated cost), and
ways to make replies lighter:
- **Context size**: Small (about 5,000 tokens of recent messages), Medium (about 15,000, the default) or Large
  (about 40,000). Older messages are summarized, so agents still know what happened.
- **Send photos again**: off, only the newest message's photos are sent; earlier ones are mentioned by name.
- **Summarize now**: folds all but the last 6 messages into the summary right away (needs an agent on a real
  model with a key).
These only change what agents are sent; the user still sees the whole chat. Agents can't change them, so point
the user to the Tokens page when they ask how to spend less.

## Home and search

Home shows a greeting and who is replying right now, then notes from the crew as one card to swipe through
(Open goes to the room, Dismiss takes it off Home), the crew (the one speaking is ringed in its color), and the
rooms. At the bottom of Home on the phone, and at the top of the room list on the PC, **Search rooms and
messages** finds any room by name or description, and any message with all the words typed, newest first.

## Agents

Each agent has a name, a role, instructions, a look (one of 25 characters), and a provider and model:
Anthropic (Claude), OpenAI, xAI (Grok), Gemini, OpenRouter, Ollama (models running on the PC itself, free and
private but slower) or Demo (canned replies, for trying the app without a key). API keys are added in Settings,
under AI models; they're checked with the provider, then kept only on the PC.

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
shows under "From your crew" on Home and as a phone notification. Settings, under Reaching out: who reaches out,
the morning brief, quiet hours (no check-ins then), a daily limit, and the follow-ups and watches agents have
set, which the user can cancel.

## Settings

Settings opens from the hub's name at the top of Home (on the PC, the hub's name at the top left). It's a short
list: the PC on top, with its version and whether it's up to date (updates appear right there, with Check now),
then one row per page, each saying where things stand:
- **You**: About you (what the crew knows about the user) and Reaching out (proactive agents, the morning brief,
  quiet hours, the daily limit, follow-ups and watches).
- **Connections**: AI models (API keys, and models on the PC for Ollama), Google, and Shared folders.
- **Hub**: Usage, and on the phone, Away from home (Tailscale). On the PC, Away from home and the updates folder
  are on the PC's own page, at the top of the list.
On the phone each row opens its own page; on the PC the list stays on the left and the page shows beside it.
Settings that open because a key is missing go straight to AI models.

## Other things the app does

- **Notifications** when replies land while the app is closed, and for scheduled and proactive messages. They
  show as conversations, with each agent's face and name, and have Reply (answer right from the notification),
  Mark as read, and Mute for an hour (that room stays quiet for an hour).
- **Share to Treehouse** from any app's share menu: send a link, text, photos or files to a room.
- **A home-screen widget** showing recent rooms, with an **Ask the crew** button that opens the latest room.
- **Usage**: estimated spend and tokens per agent and room (Settings, Usage).
- **Updates** arrive from the user's Google Drive: the PC downloads new versions, and the user taps Update PC,
  then Update, on the phone.

## What agents can do for the user, and what only the user can do

Agents (on any real model that supports tools) can change themselves with update_self: their name, role, instructions, look, model, abilities
(not Google or files), and how often they reach out. With change_settings they can rename the room, change its
description and mode, add or remove its members, and change quiet hours, the daily limit and the morning brief.
With create_room they can make a new room with the agents, mode and description the user wants.
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
