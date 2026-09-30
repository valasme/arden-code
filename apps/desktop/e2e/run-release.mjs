// Runs the tests that need the release build against target/release/arden-code.exe.
// Build it first with `pnpm build`; `pnpm test:e2e:release` does both.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const result = spawnSync("pnpm", ["exec", "playwright", "test", "release.spec.ts"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    ARDEN_E2E_EXE: path.join(repoRoot, "target", "release", "arden-code.exe"),
    ARDEN_E2E_RELEASE: "1",
  },
});
process.exit(result.status ?? 1);
