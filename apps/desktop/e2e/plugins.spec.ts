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
  test("opens from the sidebar, and Installed lists the plugins Claude Code has installed", async () => {
    const claude = claudeOnPath({ plugins: { installed } });
    const app = await launchApp({ env: claude.env });
    try {
      const { page } = app;
      const sidebar = page.getByRole("complementary", { name: "Sidebar" });
      await sidebar.getByRole("link", { name: "Plugins" }).click();

      await expect(page.getByRole("heading", { level: 1, name: "Plugins" })).toBeVisible();
      await sidebar.getByRole("link", { name: "Installed" }).click();
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

  test("a plugin installed from Discover is listed under Installed", async () => {
    const available = [
      {
        pluginId: "superpowers@claude-plugins-official",
        name: "superpowers",
        description: "Core skills library.",
        marketplaceName: "claude-plugins-official",
        source: { source: "url", url: "https://github.com/obra/superpowers.git" },
        installCount: 182_400,
        version: "4.3.1",
      },
      {
        pluginId: "github@claude-plugins-official",
        name: "github",
        description: "Official GitHub MCP server.",
        marketplaceName: "claude-plugins-official",
        source: "./external_plugins/github",
        version: "1.2.0",
      },
    ];
    const claude = claudeOnPath({ plugins: { available } });
    const app = await launchApp({ env: claude.env });
    try {
      const { page } = app;
      const sidebar = page.getByRole("complementary", { name: "Sidebar" });
      await sidebar.getByRole("link", { name: "Plugins" }).click();
      await page.getByRole("option", { name: /^github/u }).click({ timeout: 30_000 });
      const details = page.getByRole("region", { name: "github" });
      await details.getByRole("button", { name: "Install…" }).click();
      const dialog = page.getByRole("dialog", { name: "Install github" });
      await dialog.getByRole("button", { name: "Install" }).click();

      await expect(details).toContainText(
        "Successfully installed plugin: github@claude-plugins-official (scope: user)",
        { timeout: 30_000 },
      );
      await sidebar.getByRole("link", { name: "Installed" }).click();
      const list = page.getByRole("list", { name: "Installed plugins" });
      await expect(list.getByRole("heading", { name: "github" })).toBeVisible();
      await expect(list).toContainText("For you, in every project");
    } finally {
      app.kill();
      claude.remove();
    }
  });
});
