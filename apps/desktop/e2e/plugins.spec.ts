import { expect, claudeOnPath, launchApp, test } from "./fixtures";

/** Plugins as `claude plugin list --json` prints them (ADR 0053). */
const installed = [
  {
    id: "superpowers@claude-plugins-official",
    version: "4.3.1",
    scope: "user",
    enabled: true,
    installPath: "C:\\cache\\superpowers",
    mcpServers: { github: { command: "npx", env: { GITHUB_TOKEN: "ghp_e2e_secret" } } },
  },
  {
    id: "deploy@acme",
    version: "0.9.2",
    scope: "project",
    enabled: false,
    installPath: "C:\\cache\\deploy",
    projectPath: "C:\\Work\\billing-api",
  },
];

test.describe("the Plugins page in the real app", () => {
  test("opens from the sidebar and lists the plugins Claude Code has installed", async () => {
    const claude = claudeOnPath({ plugins: { installed } });
    const app = await launchApp({ env: claude.env });
    try {
      const { page } = app;
      const sidebar = page.getByRole("complementary", { name: "Sidebar" });
      await sidebar.getByRole("link", { name: "Plugins" }).click();

      await expect(page.getByRole("heading", { level: 1, name: "Plugins" })).toBeVisible();
      const list = page.getByRole("list", { name: "Installed plugins" });
      await expect(list.getByRole("heading", { name: "superpowers" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(list.getByRole("heading", { name: "deploy" })).toBeVisible();
      await expect(list).toContainText("For everyone in this project");
      await expect(list).not.toContainText("ghp_e2e_secret");
    } finally {
      app.kill();
      claude.remove();
    }
  });
});
