import { existsSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  claudeOnPath,
  launchApp,
  parentOf,
  processesOf,
  runs,
  until,
  type RunningApp,
} from "./fixtures";
import { ENTER, type Element, type Session } from "./webdriver";

/** Whether the page shows this text anywhere. */
function shows(session: Session, text: string): Promise<boolean> {
  return session.run<boolean>("return document.body.innerText.includes(arguments[0]);", text);
}

/** The session view's transcript, which the welcome state does not have. */
const TRANSCRIPT = 'main[aria-label="Session"]';
/** The message box. */
const MESSAGE_BOX = 'textarea[aria-label="Message"]';

/** Waits for an element, and returns it. */
async function element(session: Session, selector: string, what: string): Promise<Element> {
  let found: Element | undefined;
  await until(async () => {
    found = await session.find(selector);
    return found !== undefined;
  }, what);
  if (!found) throw new Error(`no ${what}`);
  return found;
}

/** Starts a new session with the sidebar's button. */
async function newSession(session: Session) {
  await element(session, '[data-area="titlebar"]', "the page");
  const button = await session.pick(
    `return [...document.querySelectorAll("button, a")]
       .find((element) => element.textContent.trim().startsWith("New session")) ?? null;`,
  );
  expect(button, "a New session button").toBeDefined();
  await button?.click();
  await element(session, TRANSCRIPT, "the session view");
}

/** Writes a message in the open session's message box and sends it. */
async function say(session: Session, message: string) {
  const box = await element(session, MESSAGE_BOX, "the session's message box");
  await box.type(message);
  await box.type(ENTER);
}

/** Makes Claude the agent of the open session. */
async function chooseClaude(session: Session) {
  const menu = await element(session, 'button[aria-label^="Agent: "]', "the agent menu");
  if (await session.find('button[aria-label="Agent: Claude"]')) return;
  await menu.click();
  await element(session, '[role="menuitemradio"]', "the agents");
  const claude = await session.pick(
    `return [...document.querySelectorAll('[role="menuitemradio"]')]
       .find((item) => item.textContent.trim().startsWith("Claude")) ?? null;`,
  );
  expect(claude, "Claude in the agent menu").toBeDefined();
  await claude?.click();
  await element(session, 'button[aria-label="Agent: Claude"]', "Claude as the agent");
}

/** Starts a Claude session through the stand-in, sends it a message and waits for the answer. */
async function claudeAnswers(app: RunningApp, message: string) {
  const { session } = app;
  await newSession(session);
  await chooseClaude(session);
  await say(session, message);
  await until(() => shows(session, `You said: ${message}`), "Claude's answer", 30_000);
}

test.describe("sessions on Linux", () => {
  test("the Demo agent streams a reply from Rust, and the files are in the app's folders", async () => {
    const app = await launchApp();
    try {
      await newSession(app.session);
      await say(app.session, "Hello from Linux");

      await until(() => shows(app.session, "This is the Demo agent."), "the Demo agent's reply");
      expect(existsSync(path.join(app.dataDir, "local", "playground"))).toBe(true);
      expect(existsSync(path.join(app.dataDir, "local", "sessions.db"))).toBe(true);
    } finally {
      await app.close();
    }
  });

  test("a Claude session answers through the claude found on PATH", async () => {
    const claude = claudeOnPath();
    const app = await launchApp({ path: claude.path });
    try {
      await claudeAnswers(app, "Hello from the Linux test");

      expect(processesOf(path.join(claude.bin, "claude")).length).toBeGreaterThan(0);
    } finally {
      await app.close();
      claude.remove();
    }
  });
});

test.describe("agent programs end with the app on Linux", () => {
  for (const [signal, how] of [
    ["SIGTERM", "is told to stop"],
    ["SIGKILL", "is killed"],
  ] as const) {
    test(`Claude Code ends when the app ${how}`, async () => {
      const claude = claudeOnPath();
      const app = await launchApp({ path: claude.path });
      try {
        await claudeAnswers(app, `Hello before ${signal}`);
        const [agent] = processesOf(path.join(claude.bin, "claude"));
        expect(agent, "the stand-in runs").toBeDefined();
        const appProcess = parentOf(agent ?? 0);

        process.kill(appProcess, signal);

        await until(() => !runs(agent ?? 0), "Claude Code to end", 10_000);
        await until(() => !runs(appProcess), "the app to end", 10_000);
      } finally {
        await app.close().catch(() => {});
        claude.remove();
      }
    });
  }
});
