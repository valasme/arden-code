// Measures the release build against the plan's performance targets.
// Build it first with `pnpm build`; `pnpm test:perf` does both.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const result = spawnSync("pnpm", ["exec", "playwright", "test", "performance.spec.ts"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    ARDEN_E2E_EXE: path.join(repoRoot, "target", "release", "arden-code.exe"),
    ARDEN_E2E_PERF: "1",
  },
});
process.exit(result.status ?? 1);
