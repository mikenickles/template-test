/** Chat's everyday tools: memory, tasks, routines, reminders, channels, reactions and suggested replies. */
import { type Channel, type ChannelSummary } from "../db.ts";
import { CHANNEL_SECTIONS, SECTIONS } from "../memory.ts";
import { type ToolDef } from "../providers/types.ts";
import { STATUS_LABEL, STATUSES } from "../tasks.ts";
import { CHANNEL_ICONS, REACTIONS, MAIN } from "./context.ts";

export function memoryTools(channels: ChannelSummary[], current: Channel | null): ToolDef[] {
  const notebooks = [MAIN, ...channels.map((c) => c.name)];
  const sections = [...new Set([...SECTIONS, ...CHANNEL_SECTIONS])];
  const notebookHelp =
    `"${MAIN}" is your memory of the user in general (sections: ${SECTIONS.join(", ")}).` +
    (channels.length ? ` A channel name is that subject's notebook (sections: ${CHANNEL_SECTIONS.join(", ")}).` : "") +
    (current ? ` You're in the ${current.name} channel.` : "");
  const tools: ToolDef[] = [
    {
      name: "react",
      description:
        "Put an emoji reaction on the user's latest message, the way a friend taps a reaction on a text. " +
        "Use it often, whenever the message has any feeling in it: good news, thanks, a joke, plans, excitement, a win, something sad. 😂 for funny, 💀 for so funny it's deadly, 😮 for wow. React and reply in the same turn. " +
        "Write your reply and react in the same response. When nothing more needs saying (\"thanks!\", \"ok cool\"), the reaction can be your whole reply: send no text.",
      schema: {
        type: "object",
        properties: { emoji: { type: "string", enum: [...REACTIONS] } },
        required: ["emoji"],
      },
    },
    {
      name: "remember",
      description: "Save one lasting fact to a notebook. One short line that makes sense on its own.",
      schema: {
        type: "object",
        properties: {
          notebook: { type: "string", enum: notebooks, description: notebookHelp },
          section: { type: "string", enum: sections, description: "A section of that notebook." },
          text: { type: "string", description: "The fact, as one short line." },
        },
        required: ["notebook", "section", "text"],
      },
    },
    {
      name: "forget",
      description: "Remove one line from a notebook, e.g. a fact that changed or an open loop that closed.",
      schema: {
        type: "object",
        properties: {
          notebook: { type: "string", enum: notebooks, description: notebookHelp },
          section: { type: "string", enum: sections },
          match: { type: "string", description: "Words from the line to remove. Must match exactly one line." },
        },
        required: ["notebook", "section", "match"],
      },
    },
    {
      name: "create_channel",
      description:
        "Make a new channel: a separate chat with its own notebook for one ongoing subject. Only when the user asks for one, or agrees to your suggestion.",
      schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short name, one or two words, e.g. 'Home', 'Rowan', 'Kitchen'." },
          about: { type: "string", description: "One line on what the channel is for." },
          icon: { type: "string", enum: [...CHANNEL_ICONS] },
        },
        required: ["name", "about"],
      },
    },
  ];
  const statusNames = STATUSES.map((s) => STATUS_LABEL[s]);
  tools.push(
    {
      name: "create_task",
      description:
        "Add a task: something the user hands off that takes real work, or that they ask you to track. With start, a background worker begins on it now from your brief and reports back in this chat.",
      schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short and specific, e.g. 'Find a plumber for the kitchen leak'." },
          details: {
            type: "string",
            description: "The written brief the worker starts from: the goal, what done looks like, limits (budget, dates), and everything relevant you already know.",
          },
          start: { type: "boolean", description: "Start a background worker on it now (default true). False just tracks it as Up next." },
          research: {
            type: "boolean",
            description:
              "A research question (compare options, find the best X, what's the latest on Y): the worker searches the web, reads the best sources in full, and writes a report doc with its sources. Needs web search on.",
          },
          steps: { type: "array", items: { type: "string" }, description: "Optional checklist, a few short steps." },
          channel: {
            type: "string",
            enum: ["none", ...channels.map((c) => c.name)],
            description: current ? `Defaults to this channel (${current.name}).` : "Defaults to none (the main chat).",
          },
        },
        required: ["title"],
      },
    },
    {
      name: "update_task",
      description: "Change a task: its status, what you need from the user, its steps, or add a note to its log.",
      schema: {
        type: "object",
        properties: {
          id: { type: "integer", description: "The task number, e.g. 12 for #12." },
          status: { type: "string", enum: statusNames, description: "Ready for you = you need the user's input or review; say what in 'needs'." },
          needs: { type: "string", description: "With Ready for you: the one question or decision you need from the user." },
          note: { type: "string", description: "A line for the task's log." },
          add_steps: { type: "array", items: { type: "string" } },
          finish_steps: { type: "array", items: { type: "integer" }, description: "Step numbers (1 = first) that are now done." },
        },
        required: ["id"],
      },
    },
    {
      name: "start_task",
      description:
        "Start or resume the background worker on a task, e.g. after the user answers the worker's question. Pass their answer or new instructions as note.",
      schema: {
        type: "object",
        properties: { id: { type: "integer" }, note: { type: "string", description: "The user's answer or extra instructions for the worker." } },
        required: ["id"],
      },
    },
    {
      name: "list_tasks",
      description: "Look up tasks. With an id, returns that task's details, numbered steps and recent log.",
      schema: {
        type: "object",
        properties: {
          id: { type: "integer" },
          status: { type: "string", enum: ["Open", ...statusNames] },
          search: { type: "string" },
        },
      },
    },
  );
  tools.push(
    {
      name: "set_reminder",
      description: "Remind the user of something at a time: a phone notification then (even with Tomo closed) and a message here.",
      schema: {
        type: "object",
        properties: {
          text: { type: "string", description: "What to remind them of, as they'd want to read it: 'Call Dad about Sunday'." },
          at: { type: "string", description: "The user's local time, YYYY-MM-DD HH:MM." },
        },
        required: ["text", "at"],
      },
    },
    {
      name: "follow_up",
      description:
        "Schedule yourself to come back to something: to check on a thing left open (a reply the user is waiting for, a delivery, a decision), or to ask how something in their life went (an interview, a sick kid, a big day). At that time you look with your tools if there's something to look at, and post a short message here.",
      schema: {
        type: "object",
        properties: {
          about: { type: "string", description: "What to check or ask, e.g. 'Has Ortiz Plumbing confirmed Thursday?' or 'Ask how the interview went.'" },
          at: { type: "string", description: "The user's local time, YYYY-MM-DD HH:MM." },
        },
        required: ["about", "at"],
      },
    },
    {
      name: "remind_at_place",
      description:
        "Remind the user when they arrive at a place, or leave one: 'when I get to Costco', 'when I leave work'. It goes off on their phone, even with Tomo closed. place: a saved place's name (Home, Work…) or a name or address to look up near them.",
      schema: {
        type: "object",
        properties: {
          text: { type: "string", description: "What to remind them of, as they'd want to read it: 'Grab milk'." },
          place: { type: "string", description: "Where: 'Home', 'Costco', '123 Main St'." },
          on: { type: "string", enum: ["arrive", "leave"] },
        },
        required: ["text", "place"],
      },
    },
    {
      name: "cancel_reminder",
      description: "Cancel a reminder or follow-up that's no longer needed. The coming ones are listed in your instructions with their #id (a place reminder's id starts with p, like p3).",
      schema: { type: "object", properties: { id: { type: ["number", "string"] } }, required: ["id"] },
    },
    {
      name: "suggest_replies",
      description: "Offer the user up to three next steps as buttons under your reply, written as they'd say them. Tapping one sends it as their message. Write your reply first, with the full answer; call this in the same step as that text or after it, never in place of it.",
      schema: {
        type: "object",
        properties: { options: { type: "array", items: { type: "string", maxLength: 48 }, maxItems: 3 } },
        required: ["options"],
      },
    },
  );
  tools.push(
    {
      name: "create_routine",
      description:
        "Set up a routine: a scheduled check that runs on its own (while Tomo is open or when it next opens) and posts here only when there's news. E.g. a morning brief, a weekly school-mail check, a watch for bills.",
      schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short, e.g. 'Friday school check'." },
          instructions: { type: "string", description: "What to check and what counts as worth posting. Written for the assistant that will run it." },
          times: { type: "string", description: "Local times, HH:MM, comma-separated, e.g. '07:00' or '08:00,20:00'. For a repeating check: 'every 15 min', 'every 2 hours', or 'every 30 min from 08:00 to 18:00'. Leave out when it starts from `when`." },
          when: {
            type: "object",
            description:
              "Instead of a time: start the routine when something happens. mail: new mail from someone (from: a name, an address, or a word in the subject). place: the user arrives at or leaves one of their saved places (place, on: arrive|leave; the phone watches it). notification: a notification on their phone mentions some words (match). Use this for 'when Dana emails, tell me right away', 'when I get home, remind me of what's due tomorrow', 'when my package is delivered, add unboxing to my list'.",
            properties: {
              kind: { type: "string", enum: ["mail", "place", "notification"] },
              from: { type: "string" },
              place: { type: "string" },
              on: { type: "string", enum: ["arrive", "leave"] },
              match: { type: "string" },
            },
            required: ["kind"],
          },
          days: { type: "string", description: "Days as digits, 0 = Sunday … 6 = Saturday. '0123456' every day, '12345' weekdays." },
          always_post: { type: "boolean", description: "Post every run (like a daily brief) instead of only when there's news." },
          channel: { type: "string", enum: ["none", ...channels.map((c) => c.name)], description: current ? `Defaults to this channel (${current.name}).` : "Where it posts. Defaults to the main chat." },
          model: { type: "string", description: "Only when the user asks for one: the model this routine runs on, by name ('haiku', 'Opus 5.5', 'gemini flash') or 'default' to follow Who does what." },
        },
        required: ["name", "instructions"],
      },
    },
    {
      name: "update_routine",
      description: "Change, pause or resume a routine. Pass only what changes.",
      schema: {
        type: "object",
        properties: {
          id: { type: "integer" },
          enabled: { type: "boolean" },
          times: { type: "string" },
          days: { type: "string" },
          instructions: { type: "string" },
          name: { type: "string" },
          model: { type: "string", description: "Only when the user asks for one: the model this routine runs on, by name ('haiku', 'Opus 5.5', 'gemini flash') or 'default' to follow Who does what." },
        },
        required: ["id"],
      },
    },
    {
      name: "list_routines",
      description: "See the user's routines with their schedules.",
      schema: { type: "object", properties: {} },
    },
  );
  const others = channels.filter((c) => c.id !== current?.id);
  if (others.length)
    tools.push({
      name: "read_channel",
      description: "Read another channel: what it's for, its notebook, and its latest messages.",
      schema: {
        type: "object",
        properties: {
          channel: { type: "string", enum: others.map((c) => c.name) },
          messages: { type: "integer", minimum: 1, maximum: 40, description: "How many recent messages (default 12)." },
        },
        required: ["channel"],
      },
    });
  return tools;
}
