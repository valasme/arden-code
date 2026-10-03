import type { Channel } from "@tauri-apps/api/core";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { z } from "zod";

import type {
  AppError,
  ErrorCode,
  Project,
  Session,
  SessionList,
  SessionSummary,
  TurnEvent,
} from "@/ipc/bindings";

import { settingsWith } from "./settings";

/** The Playground, as Rust describes it. */
export const playground = {
  id: "playground",
  kind: "playground",
  name: "Playground",
  path: String.raw`C:\Users\Ada\AppData\Local\io.github.valasme.arden\playground`,
} as const;

/** What a command that fails throws, as it reaches the UI through the isolation frame. */
function failure(code: ErrorCode): string {
  const error: AppError = { code, messageKey: `errors.${code}`, details: null };
  return JSON.stringify(error);
}

function summaryOf({ turns: _turns, ...summary }: Session): SessionSummary {
  return summary;
}

/** A session as Rust keeps it: made at the given time, with no turns, in the Playground unless said. */
export function sessionNamed(
  id: string,
  title: string | null,
  projectId: string = playground.id,
): Session {
  return {
    id,
    projectId,
    agent: "demo",
    title,
    createdAt: "2026-09-30T14:05:09Z",
    updatedAt: "2026-09-30T14:05:09Z",
    pinned: false,
    archivedAt: null,
    turns: [],
  };
}

/** When the stand-in archives a session. */
export const archivedAt = "2026-10-02T09:30:00Z";

/** A folder opened as a project. */
export function folderProject(id: string, name: string): Project {
  return { id, kind: "folder", name, path: `C:\\Work\\${name}` };
}

interface Options {
  regionalFormat?: "windows" | "english";
  /** Events sent before the answer to send_message, as a fast reply can. */
  emitBeforeAnswering?: TurnEvent[];
  failCreate?: boolean;
  /** What went wrong with the sessions file when Rust started. */
  sessionsNotice?: AppError | null;
  /** The sessions Rust has when the page comes up, the oldest first. */
  sessions?: Session[];
  /** Commands that fail, each with the code it fails with. */
  failing?: Partial<Record<string, ErrorCode>>;
  /** Folders opened as projects, after the Playground. */
  folders?: Project[];
}

/**
 * Rust as a test double for the session commands: the sessions in memory, listed as the sidebar
 * lists them, and a way to stream a reply by hand.
 */
export function startSessionsRust({
  emitBeforeAnswering = [],
  failCreate = false,
  regionalFormat = "windows",
  sessionsNotice = null,
  sessions: kept = [],
  failing = {},
  folders = [],
}: Options = {}) {
  Object.assign(globalThis, { isTauri: true });
  mockWindows("main");
  const sessions: Session[] = structuredClone(kept);
  const calls: { command: string; payload: unknown }[] = [];
  let made = sessions.length;
  let notice = sessionsNotice;
  let channel: Channel<TurnEvent> | undefined;

  const find = (id: string) => {
    const found = sessions.find((session) => session.id === id);
    if (!found) throw failure("ARD-AGT-001");
    return found;
  };
  // The pinned sessions, in the order they were pinned, and the archived ones, the last first.
  const pins: string[] = sessions.filter((session) => session.pinned).map(({ id }) => id);
  const archives: string[] = sessions
    .filter((session) => session.archivedAt !== null)
    .map(({ id }) => id)
    .toReversed();
  const list = (): SessionList => {
    const newestFirst = sessions
      .toReversed()
      .filter((session) => !session.pinned && session.archivedAt === null);
    return {
      archived: archives.map((id) => summaryOf(find(id))),
      pinned: pins.map((id) => summaryOf(find(id))),
      projects: [playground, ...folders].map((project) => ({
        project,
        sessions: newestFirst.filter((session) => session.projectId === project.id).map(summaryOf),
      })),
    };
  };
  const withId = z.object({ id: z.string() });

  mockIPC(
    (command, payload) => {
      calls.push({ command, payload });
      const fails = failing[command];
      if (fails) throw failure(fails);
      switch (command) {
        case "app_info": {
          return { name: "Arden Code", version: "0.1.0" };
        }
        case "get_settings": {
          return settingsWith({ general: { regionalFormat } });
        }
        case "list_sessions": {
          return list();
        }
        case "take_sessions_notice": {
          const taken = notice;
          notice = null;
          return taken;
        }
        case "create_session": {
          if (failCreate) throw failure("ARD-AGT-001");
          made += 1;
          const session = sessionNamed(`session-${made}`, null);
          sessions.push(session);
          return summaryOf(session);
        }
        case "get_session": {
          // A copy, as the one that crosses the IPC boundary is.
          return structuredClone(find(withId.parse(payload).id));
        }
        case "remember_open_session": {
          find(withId.parse(payload).id);
          return null;
        }
        case "rename_session": {
          const { id, name } = z.object({ id: z.string(), name: z.string() }).parse(payload);
          const trimmed = name.trim();
          if (trimmed === "" || trimmed.length > 100) throw failure("ARD-AGT-006");
          if (find(id).archivedAt !== null) throw failure("ARD-AGT-005");
          find(id).title = trimmed;
          return null;
        }
        case "set_session_pinned": {
          const { id, pinned } = z.object({ id: z.string(), pinned: z.boolean() }).parse(payload);
          const session = find(id);
          if (pinned && !session.pinned) pins.push(id);
          if (!pinned && session.pinned) pins.splice(pins.indexOf(id), 1);
          session.pinned = pinned;
          return null;
        }
        case "set_session_archived": {
          const { id, archived } = z
            .object({ id: z.string(), archived: z.boolean() })
            .parse(payload);
          const session = find(id);
          if (archived && session.archivedAt === null) {
            archives.unshift(id);
            if (session.pinned) pins.splice(pins.indexOf(id), 1);
            session.pinned = false;
            session.archivedAt = archivedAt;
          }
          if (!archived && session.archivedAt !== null) {
            archives.splice(archives.indexOf(id), 1);
            session.archivedAt = null;
          }
          return null;
        }
        case "delete_session": {
          const { id } = withId.parse(payload);
          sessions.splice(sessions.indexOf(find(id)), 1);
          if (pins.includes(id)) pins.splice(pins.indexOf(id), 1);
          if (archives.includes(id)) archives.splice(archives.indexOf(id), 1);
          return null;
        }
        case "send_message": {
          const { sessionId, text, onEvent } = z
            .object({
              sessionId: z.string(),
              text: z.string(),
              onEvent: z.custom<Channel<TurnEvent>>(),
            })
            .parse(payload);
          const session = find(sessionId);
          if (session.archivedAt !== null) throw failure("ARD-AGT-005");
          channel = onEvent;
          session.title ??= text;
          session.turns.push({
            id: `turn-${session.turns.length + 1}`,
            prompt: text,
            startedAt: "2026-09-30T14:05:10Z",
            status: "running",
            items: [],
          });
          const answer = structuredClone(session);
          for (const event of emitBeforeAnswering) onEvent.onmessage(event);
          return answer;
        }
        default: {
          return null;
        }
      }
    },
    { shouldMockEvents: true },
  );
  return {
    calls,
    /** The calls of one command, with what each was given. */
    callsTo: (command: string) =>
      calls.filter((call) => call.command === command).map((call) => call.payload),
    sent: () => calls.filter((call) => call.command === "send_message"),
    stops: () => calls.filter((call) => call.command === "stop_reply"),
    /** Streams an event of the reply, as Rust would through the channel. */
    emit(event: TurnEvent) {
      if (!channel) throw new Error("no message was sent yet");
      channel.onmessage(event);
    },
  };
}
