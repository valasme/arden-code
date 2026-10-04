import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Project } from "@/ipc/bindings";
import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { folderProject, playground } from "@/test/sessions";

import { ProjectMenu } from "./ProjectMenu";

import "@/styles/global.css";

const projects: Project[] = [playground, folderProject("api", "api"), folderProject("web", "web")];

function renderMenu(projectId = "playground") {
  const chosen: string[] = [];
  let opened = 0;
  const view = render(
    <ProjectMenu
      projectId={projectId}
      projects={projects}
      onChoose={(id) => {
        chosen.push(id);
      }}
      onOpenFolder={() => {
        opened += 1;
      }}
    />,
  );
  return { chosen, opened: () => opened, ...view };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name }));
  const menu = await screen.findByRole("menu");
  await animationsDone(menu);
  return menu;
}

describe("ProjectMenu", () => {
  it("is an outlined button with a folder icon, named for what it chooses", () => {
    renderMenu("api");

    const button = screen.getByRole("button", { name: "Project: api" });
    expect(button).toHaveAttribute("data-variant", "outline");
    expect(button).toHaveTextContent("api");
  });

  it("lists the projects in the order given, each with its path", async () => {
    const user = userEvent.setup();
    renderMenu();

    const menu = await openMenu(user, "Project: Playground");

    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((item) => item.querySelector("[data-name]")?.textContent)).toEqual([
      "Playground",
      "api",
      "web",
    ]);
    expect(items[1]).toHaveTextContent(String.raw`C:\Work\api`);
  });

  it("ends with Open folder… and its shortcut", async () => {
    const user = userEvent.setup();
    const { opened } = renderMenu();

    const menu = await openMenu(user, "Project: Playground");
    const openFolder = within(menu).getByRole("menuitem", { name: /Open folder…/ });
    expect(openFolder).toHaveTextContent("Ctrl+O");
    await user.click(openFolder);

    expect(opened()).toBe(1);
  });

  it("answers the project picked", async () => {
    const user = userEvent.setup();
    const { chosen } = renderMenu();

    const menu = await openMenu(user, "Project: Playground");
    await user.click(within(menu).getByRole("menuitemradio", { name: /^web/ }));

    expect(chosen).toEqual(["web"]);
  });

  it("has no accessibility violations, closed or open", async () => {
    const user = userEvent.setup();
    const { container } = renderMenu();

    await expectNoAccessibilityViolations(container);
    await expectNoAccessibilityViolations(await openMenu(user, "Project: Playground"));
  });
});
