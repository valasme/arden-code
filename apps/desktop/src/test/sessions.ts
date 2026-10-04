import type { Channel } from "@tauri-apps/api/core";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { z } from "zod";

import type {
  AgentKind,
  AppError,
  ErrorCode,
  Project,
  Session,
  SessionList,
  SessionSummary,
  TurnEvent,
} from "@/ipc/bindings";

import { applyTurnEvent } from "@/features/sessions/turnEvents";

import { settingsWith } from "./settings";

/** The Playground, as Rust describes it. */
export const playground = {
  id: "playground",
  kind: "playground",
  name: "Playground",
  path: String.raw`C:\Users\Ada\AppData\Local\io.github.valasme.arden\playground`,
  trusted: true,
} as const;

/** What a command that fails throws, as it reaches the UI through the isolation frame. */
function failure(code: ErrorCode): string {
  const error: AppError = { code, messageKey: `errors.${code}`, details: null };
  return JSON.stringify(error);
}

function summaryOf({ turns: _turns, ...summary }: Session): SessionSummary {
  return summary;
}

/**
 * A session as Rust keeps it: made at the given time, with no turns, in the Playground with the Demo
 * agent unless said.
 */
export function sessionNamed(
  id: string,
  title: string | null,
  projectId: string = playground.id,
  agent: AgentKind = "demo",
): Session {
  return {
    id,
    projectId,
    agent,
    title,
    createdAt: "2026-09-30T14:05:09Z",
    updatedAt: "2026-09-30T14:05:09Z",
    pinned: false,
    archivedAt: null,
    linkedFrom: null,
    turns: [],
  };
}

/** When the stand-in archives a session. */
export const archivedAt = "2026-10-02T09:30:00Z";

/** A folder opened as a project. */
export function folderProject(id: string, name: string, trusted = false): Project {
  return { id, kind: "folder", name, path: `C:\\Work\\${name}`, trusted };
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
  /** The agent a new session takes when none is asked for (ADR 0039). */
  newSessionAgent?: AgentKind;
  /** The folder the person picks in Windows' dialog, or null when they cancel. */
  pickedFolder?: Project | null;
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
  folders: opened = [],
  newSessionAgent = "demo",
  pickedFolder = null,
}: Options = {}) {
  const folders: Project[] = structuredClone(opened);
  Object.assign(globalThis, { isTauri: true });
  mockWindows("main");
  const sessions: Session[] = structuredClone(kept);
  const calls: { command: string; payload: unknown }[] = [];
  let made = sessions.length;
  let notice = sessionsNotice;
  let channel: Channel<TurnEvent> | undefined;
  /** The session the reply streams into. */
  let replying: string | undefined;

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
        case "agent_for_new_session": {
          return newSessionAgent;
        }
        case "create_session": {
          if (failCreate) throw failure("ARD-AGT-001");
          const { agent, projectId } = z
            .object({
              agent: z.enum(["demo", "claude"]).nullable().optional(),
              projectId: z.string().nullable().optional(),
            })
            .parse(payload ?? {});
          const project = projectId ?? playground.id;
          if (project !== playground.id && !folders.some((folder) => folder.id === project)) {
            throw failure("ARD-AGT-001");
          }
          made += 1;
          const session = sessionNamed(`session-${made}`, null, project, agent ?? newSessionAgent);
          sessions.push(session);
          return summaryOf(session);
        }
        case "create_linked_session": {
          const { fromId } = z.object({ fromId: z.string() }).parse(payload);
          const original = find(fromId);
          made += 1;
          const session = {
            ...sessionNamed(`session-${made}`, null, original.projectId),
            linkedFrom: fromId,
          };
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
        case "set_session_agent": {
          const { id, agent } = z
            .object({ id: z.string(), agent: z.enum(["demo", "claude"]) })
            .parse(payload);
          const session = find(id);
          if (session.archivedAt !== null) throw failure("ARD-AGT-005");
          if (session.turns.length > 0) throw failure("ARD-AGT-014");
          session.agent = agent;
          return null;
        }
        case "rename_session": {
          const { id, name } = z.object({ id: z.string(), name: z.string() }).parse(payload);
          const trimmed = name.trim();
          if (trimmed === "" || Array.from(trimmed).length > 100) throw failure("ARD-AGT-006");
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
          for (const other of sessions) if (other.linkedFrom === id) other.linkedFrom = null;
          return null;
        }
        case "set_session_project": {
          const { id, projectId } = z
            .object({ id: z.string(), projectId: z.string() })
            .parse(payload);
          const session = find(id);
          if (session.turns.length > 0) throw failure("ARD-AGT-014");
          session.projectId = projectId;
          return null;
        }
        case "pick_folder": {
          if (pickedFolder === null) return null;
          if (!folders.some((folder) => folder.id === pickedFolder.id)) folders.push(pickedFolder);
          return pickedFolder;
        }
        case "trust_project": {
          const { projectId } = z.object({ projectId: z.string() }).parse(payload);
          const project = folders.find((candidate) => candidate.id === projectId);
          if (project) project.trusted = true;
          else if (projectId !== playground.id) throw failure("ARD-AGT-001");
          return null;
        }
        case "answer_approval": {
          const { sessionId, itemId } = z
            .object({
              sessionId: z.string(),
              itemId: z.string(),
              answer: z.enum(["allow", "alwaysAllow", "deny"]),
            })
            .parse(payload);
          const waits = find(sessionId).turns.some(
            (turn) =>
              turn.status === "running" &&
              turn.items.some(
                (item) =>
                  item.type === "approval" && item.id === itemId && item.state === "waiting",
              ),
          );
          if (!waits) throw failure("ARD-AGT-015");
          return null;
        }
        case "answer_questions": {
          const { sessionId, itemId } = z
            .object({
              sessionId: z.string(),
              itemId: z.string(),
              answers: z.array(z.object({ question: z.string(), answer: z.string() })),
            })
            .parse(payload);
          const waits = find(sessionId).turns.some(
            (turn) =>
              turn.status === "running" &&
              turn.items.some(
                (item) =>
                  item.type === "questions" && item.id === itemId && item.state === "waiting",
              ),
          );
          if (!waits) throw failure("ARD-AGT-015");
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
          replying = sessionId;
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
      if (!channel || replying === undefined) throw new Error("no message was sent yet");
      // Rust keeps the turn as it streams, so what the page asks for later agrees with it.
      const session = sessions.find((candidate) => candidate.id === replying);
      if (session) Object.assign(session, applyTurnEvent(session, event));
      channel.onmessage(event);
    },
  };
}
