import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import { expect, launchApp, test } from "./fixtures";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The app's own tool for making and using update signing keys. */
function signer(...args: string[]) {
  return execFileSync("pnpm", ["exec", "tauri", "signer", ...args], {
    cwd: desktop,
    encoding: "utf8",
    shell: true,
  });
}

interface Key {
  /** The public half, as the app is told to trust it. */
  publicKey: string;
  file: string;
}

function makeKey(folder: string, name: string): Key {
  const file = path.join(folder, `${name}.key`);
  signer("generate", "--ci", "-p", '""', "-w", file);
  return { publicKey: readFileSync(`${file}.pub`, "utf8").trim(), file };
}

/** The signature of a file, as an update server lists it. */
function sign(file: string, key: Key): string {
  signer("sign", "-f", key.file, "-p", '""', file);
  return readFileSync(`${file}.sig`, "utf8").trim();
}

interface Release {
  version: string;
  /** What is written as the signature, or nothing for a manifest without one. */
  signature: string | undefined;
}

function portOf(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the server has no port");
  return address.port;
}

/** A server of our own that says which release exists, and counts how often it was asked. */
async function updateServer(release: () => Release | undefined) {
  let asked = 0;
  const server: Server = createServer((request, response) => {
    if (request.url === "/latest.json") {
      asked += 1;
      const current = release();
      if (!current) {
        response.writeHead(404).end();
        return;
      }
      const port = portOf(server);
      const platform = {
        url: `http://127.0.0.1:${port}/update.bin`,
        ...(current.signature === undefined ? {} : { signature: current.signature }),
      };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          version: current.version,
          notes: "A test release",
          pub_date: "2026-09-30T00:00:00Z",
          platforms: { "windows-x86_64": platform },
        }),
      );
      return;
    }
    if (request.url === "/update.bin") {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end("the bytes of an update");
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = portOf(server);
  return {
    url: `http://127.0.0.1:${port}/latest.json`,
    asked: () => asked,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function checkFromAbout(page: Page) {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "About", exact: true }).click();
  await page.getByRole("button", { name: "Check for updates" }).click();
}

function logText(dataDir: string): string {
  const folder = path.join(dataDir, "local", "logs");
  if (!existsSync(folder)) return "";
  return readdirSync(folder)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => readFileSync(path.join(folder, name), "utf8"))
    .join("\n");
}

test.describe("updates in the real app", () => {
  let folder: string;
  let trusted: Key;
  let stranger: Key;
  let artifactSignature: string;
  let strangerSignature: string;

  test.beforeAll(() => {
    folder = mkdtempSync(path.join(tmpdir(), "arden-e2e-updates-"));
    trusted = makeKey(folder, "trusted");
    stranger = makeKey(folder, "stranger");
    // The artifact the server hands out is these exact bytes; a signature is only valid for them.
    const artifact = path.join(folder, "update.bin");
    writeFileSync(artifact, "the bytes of an update");
    artifactSignature = sign(artifact, trusted);
    strangerSignature = sign(artifact, stranger);
  });

  test.afterAll(() => {
    rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  const environment = (url: string, extra: Record<string, string> = {}) => ({
    ARDEN_CODE_UPDATE_URL: url,
    ARDEN_CODE_UPDATE_PUBLIC_KEY: trusted.publicKey,
    ...extra,
  });

  test("a release signed with the app's key is downloaded and offered as a restart", async () => {
    const server = await updateServer(() => ({ version: "9.9.9", signature: artifactSignature }));
    const app = await launchApp({ env: environment(server.url) });
    try {
      await checkFromAbout(app.page);

      await expect(
        app.page.getByText(
          "An update is ready. Restart Arden Code from the status bar to install it.",
        ),
      ).toBeVisible();
      await expect(app.page.getByRole("button", { name: "Update ready: restart" })).toBeVisible();
    } finally {
      app.kill();
      await server.close();
    }
  });

  test("a release signed with another key is refused", async () => {
    const server = await updateServer(() => ({ version: "9.9.9", signature: strangerSignature }));
    const app = await launchApp({ env: environment(server.url) });
    try {
      await checkFromAbout(app.page);

      await expect(
        app.page.getByText(
          "An update was found, but its signature is not valid, so it was not used.",
        ),
      ).toBeVisible();
      await expect(app.page.getByRole("button", { name: "Update ready: restart" })).toBeHidden();
      expect(logText(app.dataDir)).toContain("the update was not used");
    } finally {
      app.kill();
      await server.close();
    }
  });

  test("a release with a signature that is not a signature is refused", async () => {
    const server = await updateServer(() => ({ version: "9.9.9", signature: "not-a-signature" }));
    const app = await launchApp({ env: environment(server.url) });
    try {
      await checkFromAbout(app.page);

      await expect(
        app.page.getByText(
          "An update was found, but its signature is not valid, so it was not used.",
        ),
      ).toBeVisible();
      await expect(app.page.getByRole("button", { name: "Update ready: restart" })).toBeHidden();
    } finally {
      app.kill();
      await server.close();
    }
  });

  test("a release with no signature at all is refused", async () => {
    const server = await updateServer(() => ({ version: "9.9.9", signature: undefined }));
    const app = await launchApp({ env: environment(server.url) });
    try {
      await checkFromAbout(app.page);

      await expect(
        app.page.getByText(
          "An update was found, but its signature is not valid, so it was not used.",
        ),
      ).toBeVisible();
      await expect(app.page.getByRole("button", { name: "Update ready: restart" })).toBeHidden();
    } finally {
      app.kill();
      await server.close();
    }
  });

  test("the same version is not an update", async () => {
    const server = await updateServer(() => ({ version: "0.1.0", signature: artifactSignature }));
    const app = await launchApp({ env: environment(server.url) });
    try {
      await checkFromAbout(app.page);

      await expect(app.page.getByText("Arden Code is up to date.")).toBeVisible();
      await expect(app.page.getByRole("button", { name: "Update ready: restart" })).toBeHidden();
    } finally {
      app.kill();
      await server.close();
    }
  });

  test("while no release exists a check says so calmly and is logged", async () => {
    const server = await updateServer(() => undefined);
    const app = await launchApp({ env: environment(server.url) });
    try {
      await checkFromAbout(app.page);

      await expect(
        app.page.getByText("Could not check for updates right now. Try again later."),
      ).toBeVisible();
      await expect.poll(() => logText(app.dataDir)).toContain("could not check for updates");
    } finally {
      app.kill();
      await server.close();
    }
  });

  test("the app looks by itself, downloads quietly, and does not bother anyone when there is no release", async () => {
    let release: Release | undefined;
    const server = await updateServer(() => release);
    const app = await launchApp({
      env: environment(server.url, {
        ARDEN_CODE_UPDATE_FIRST_DELAY_MS: "500",
        ARDEN_CODE_UPDATE_INTERVAL_MS: "1500",
      }),
    });
    try {
      // No release yet: it asks, hears nothing, and shows nothing.
      await expect.poll(() => server.asked()).toBeGreaterThan(0);
      await expect(app.page.getByRole("button", { name: "Update ready: restart" })).toBeHidden();
      await expect(app.page.getByRole("alert")).toHaveCount(0);
      expect(logText(app.dataDir)).toContain("could not check for updates");

      // A release appears, and the next look downloads it and offers the restart.
      release = { version: "9.9.9", signature: artifactSignature };

      await expect(app.page.getByRole("button", { name: "Update ready: restart" })).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      app.kill();
      await server.close();
    }
  });

  test("with automatic checks off the app never asks", async () => {
    const server = await updateServer(() => ({ version: "9.9.9", signature: artifactSignature }));
    // The setting is in the file before the app starts, as if the person had turned it off.
    const dataDir = mkdtempSync(path.join(folder, "off-"));
    const config = path.join(dataDir, "config");
    execFileSync("node", [
      "-e",
      `require("node:fs").mkdirSync(${JSON.stringify(config)}, { recursive: true })`,
    ]);
    writeFileSync(
      path.join(config, "settings.json"),
      JSON.stringify({ version: 1, general: { checkForUpdates: false } }),
    );
    const app = await launchApp({
      dataDir,
      env: environment(server.url, {
        ARDEN_CODE_UPDATE_FIRST_DELAY_MS: "300",
        ARDEN_CODE_UPDATE_INTERVAL_MS: "600",
      }),
    });
    try {
      await expect(app.page.getByRole("main")).toBeVisible();
      await app.page.waitForTimeout(3000);

      expect(server.asked()).toBe(0);
      await expect(app.page.getByRole("button", { name: "Update ready: restart" })).toBeHidden();
    } finally {
      app.kill();
      await server.close();
    }
  });
});
