import path from "node:path";

import { type ViteDevServer, createServer } from "vite";
import { onTestFinished } from "vitest";

/**
 * The dev server as `pnpm dev` starts it, not as Vitest does: pages are split out, to load when
 * they are first opened, and the server warms up.
 */
async function startDevServer(): Promise<ViteDevServer> {
  vi.stubEnv("VITEST", undefined);
  try {
    const server = await createServer({
      configFile: path.resolve(import.meta.dirname, "../../vite.config.ts"),
      logLevel: "silent",
      server: { port: 0, strictPort: false, hmr: false, watch: null },
    });
    await server.listen();
    return server;
  } finally {
    vi.unstubAllEnvs();
  }
}

/**
 * The app's own modules that `root` needs and the dev server has not compiled yet, read from its
 * module graph without asking it for anything: asking would compile them.
 */
function notCompiled(server: ViteDevServer, root: string): string[] {
  const { moduleGraph } = server.environments.client;
  const missing: string[] = [];
  const seen = new Set<string>();
  const queue = [root];
  while (queue.length > 0) {
    const url = queue.shift() ?? "";
    if (seen.has(url)) continue;
    seen.add(url);
    const module = moduleGraph.urlToModuleMap.get(url);
    if (!module?.transformResult) {
      missing.push(url);
      continue;
    }
    for (const imported of module.importedModules) {
      if (imported.url.startsWith("/src/")) queue.push(imported.url);
    }
  }
  return missing;
}

describe("the dev server", () => {
  // The page asks for a module's imports only once it has it, so on demand, the first new session
  // after `pnpm dev` waited for its modules to compile one level at a time: over a second (#176).
  test("has compiled a session's modules before the first session is opened", async () => {
    const server = await startDevServer();
    onTestFinished(() => server.close());

    await vi.waitFor(
      () => {
        expect(notCompiled(server, "/src/features/sessions/SessionView.tsx")).toEqual([]);
      },
      { timeout: 30_000, interval: 100 },
    );
  }, 60_000);
});
