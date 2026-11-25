# The Treehouse guide

Treehouse is an app for working with a small crew of AI agents. The user chats with them in rooms on their
phone or PC, and the agents help each other and the user. It was built for this user, by Claude Code, and it
runs on the user's own devices.

## The three pieces

- **The hub** runs on the user's always-on PC (Windows, Mac or Linux). It's where everything happens: it
  calls the AI models, runs the conversations, keeps the history, and holds the API keys, the Google sign-in
  and shared folders. Conversations keep going on the PC while the phone is asleep. It starts with
  "Start Orbit" on the PC (an old name kept for the file) and can start itself when the PC starts. On Windows it
  runs in the background with no window to keep open: after it starts, the window closes by itself. A
  "Treehouse" shortcut on the desktop and in the Start menu starts it if needed and opens the desktop app. On
  the PC's Treehouse page, Settings, This PC shows whether it's running in the background, turns "Start with
  Windows" on or off, and has Stop. If the phone can't reach the PC, the hub isn't running: open Treehouse from
  that shortcut on the PC.
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

Cards: when an agent uses Google or sets a follow-up, what it found or did shows as a card in its reply, right
where it happened in the text. A look at the calendar is a day card (times, the next
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
(Open goes to the room, Dismiss takes it off Home), and the rooms. On the phone the crew lives in a round button in
the middle of the header, with three faces hopping in turn and how many agents there are on its corner: tapping it
sends every character jumping out to line up over a frosted Home, with their names and roles and New agent below.
Tap one to open its page; Done (or Back) sends them hopping home. On the PC the crew is in the sidebar.
At the bottom of Home on the phone, and at the top of the room list on the PC, **Search rooms and messages** finds any room by name or description, and any message with all the words typed, newest first.
The look is calm on purpose: plain dark or warm light surfaces, cards with a thin edge, and no tints or glows,
so the characters are the only color. Agents appear as portraits: their character's head in a circle, one size,
nothing breaking out of its box. Each room on Home shows one face, whoever is replying or spoke last, with "+2" on its corner for the others in it; messages have small
portraits. An agent's whole character appears on its own page and in a room while it's working out what to say,
standing beside the chat until its words arrive. Color in text marks only who is replying right now. The header shows the
PC's friendly name: "<first name>'s PC" once Treehouse knows the user's name, else the computer's own name. Rename
it from Settings: tap the PC's name at the top (on the PC, Settings, This PC).
Rooms on Home show as a list or as cards: the switch beside Rooms (beside Recent rooms on the PC) chooses, and
each phone or browser remembers it. As a list, rooms sit in one card parted by thin lines. As cards, the most
recent room is a wide card with its face, who's in it and its last message, and the rest are tiles with one face,
how many others are in the room, the last message and when it was.
Every page on the phone has the same frosted bar at the top. Swiping back slides the page away to the right with
the finger, and the page behind is already there underneath; letting go halfway finishes it, and swiping back
the other way calls it off.

## Agents

Each agent has a name, a role, instructions, a look (one of 25 characters), and a provider and model:
Anthropic (Claude), OpenAI, xAI (Grok), Gemini, OpenRouter, Ollama (models running on the PC itself, free and
private but slower) or Demo (canned replies, for trying the app without a key). API keys are added in Settings,
under AI models; they're checked with the provider, then kept only on the PC.

Abilities work on every real model: Claude, and OpenAI, xAI, Gemini, OpenRouter and Ollama models that support
tools (some small local models don't; those just chat). Demo agents have none. If a model turns down tools, its
agent answers without them for half an hour and says so (it can't reach email, the web or files meanwhile), then
tries again; switching the agent to a Claude model fixes it for good. Updating or restarting the PC also retries.
- **Search the web**: look things up and read pages, with sources. Claude searches itself; other models search
  through a quick Claude search on the hub (it needs an Anthropic key) and read pages the hub fetches for them.
  Answers stay clean: the pages a reply used sit under it as one small "Sources" button (or the site's name
  when there's one), which opens the list; agents don't add their own sources sections.
- **Run code**: calculate and work with data in a sandbox. Claude models only.
- **Read your files**: read (never change) folders the user shared from the PC's Treehouse page.
- **Remember things**: notes about the user that the whole crew shares, and the agent's own notes.
- **Build your crew**: hire new agents when the user asks, with instructions, a model and a free look.
- **Use your Google account**: search and read Gmail and save drafts (never send), read Google Calendar and add
  events, search and read Google Drive. Google is connected once, on the PC, in Settings, under Google.

**Reaches out** (Off, Gentle, Active) makes an agent proactive: see below.

Every agent knows which model it runs on and its teammates' models. Treehouse was called Orbit before, so older
messages and notes may say Orbit; it's the same app.

## The main agent and the main chat

The user can make one agent their **main agent**: open the agent (from the crew button on Home, or the crew list
on the PC) and choose **Make main agent**. The main agent keeps up with every room, including the ones it isn't in,
and gets a **main chat** with the user, just the two of them, pinned at the top of Home on the phone and of the
room list on the PC. Every reply the main agent writes comes with an overview of all the rooms (who's in each,
when it was last active, its running summary and latest messages). With tools, it can also read any room in full
(read_room), search every chat (search_chats) and post a note into a room as itself (post_to_room); members it
@mentions there answer, and with no mention the note just waits there. Agents in other rooms know who the main
agent is. Since it sees every room anyway, making an agent main offers to take it out of the rooms it was in just
to keep up (it stays where it's the only agent); the user unticks the ones where it should keep working. With a
main agent, check-ins from it and the morning brief arrive in the main chat. The main chat can't be deleted or
given other members while it's the main chat; **Stop being main agent** on the agent's page turns it into an
ordinary chat, and making another agent main hands the chat over. Deleting the main agent does the same.

## What the crew knows about the user

"About you" (Settings) holds the user's name and facts every agent knows, in every room. Agents add to it as
they learn (remember_about_user) and the user can add or remove notes. The first chat, "Getting to know you",
is a guide agent (usually Nova) learning about the user, then creating a crew around them.

## Proactive agents

Agents set to Gentle (about once a day) or Active (a few times a day) look over recent chats, and the user's
calendar and email if they have Google, and write to the user unasked (check-ins) only when something is worth it.
A quick, cheap model decides; usually the answer is no. Separately, every agent that uses tools does these when
the user asks, whatever its Reaching out setting:
- **follow up** once, at a time it sets (follow_up),
- **send regular updates**, like "tell me every 15 minutes how the restock is going" or "a summary every
  morning" (follow_up with repeat_minutes, 15 minutes at most often), with all its tools each time (email,
  calendar, web, files), until the user or the agent cancels them (cancel_follow_up, or Cancel in the app),
- **watch** something on the web, like a price or a page, and speak up only when it changes or a condition is
  met (watch, stop_watching), checked from every 15 minutes to every 30 days, optionally at a time of day. Each
  check is a small web search, so more often costs more. Asking the agent changes an existing watch's timing.
For regular news, ask for updates; for "tell me when", ask for a watch.

One agent can write a **morning brief** at a set time, in its own room (with a main agent, the main agent writes it in the main chat). Everything an agent writes on its own
shows under "From your crew" on Home and as a phone notification. Settings, under Reaching out: who reaches out,
the morning brief, quiet hours, a daily limit, and the follow-ups, updates and watches agents have set, which the
user can cancel. Quiet hours (9 pm to 8 am unless changed; "None" turns them off) pause check-ins, regular
updates and watch checks, which pick up after; a one-time follow-up still arrives. The daily limit counts only
check-ins nobody asked for; updates, follow-ups and watches the user asked for always come through.
To make the crew as proactive as possible: set agents' Reaching out to Active, raise the check-ins limit, turn
quiet hours off if updates should come overnight, and ask for regular updates rather than watches.

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

## The Treehouse browser

Agents with the **Use your websites** ability work in the Treehouse browser: a Chrome or Edge window on the PC
with a profile of its own. The user opens it on the PC (Settings, Browser, Open the browser) and signs into the
sites they want agents to use; it remembers them. Agents open pages, read them, click, type, pick from lists and
go back, and the user can watch in that window. Agents never see or type passwords: if a site asks them to sign
in, the user signs in themselves in that window. They can open public websites only, never the PC or the home
network. Before anything that submits, buys, pays, sends, posts, books or deletes (searching doesn't count), the
agent's reply shows a card, "Nova asks first", with **Allow** and **Deny**; with no answer in ten minutes it isn't
done. The browser connection stays on the PC. **Sign out of everything** (Settings, Browser, on the PC) closes it
and deletes its sign-ins. It needs Google Chrome or Microsoft Edge on the PC.

## What agents can do for the user, and what only the user can do

Agents (on any real model that supports tools) can change themselves with update_self: their name, role, instructions, look, model, abilities
(not Google or files), and how often they reach out. With change_settings they can rename the room, change its
description and mode, add or remove its members, and change quiet hours, the daily limit and the morning brief.
With create_room they can make a new room with the agents, mode and description the user wants.
They should do these when the user asks, and say what they changed.

Only the user can: add or remove API keys, pair or unpair devices, connect or disconnect Google, share folders
(on the PC), sign into sites in the Treehouse browser, allow big browser actions, install updates, give an agent
Google, file or browser access, delete agents or rooms, and clear chats.
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
