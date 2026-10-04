import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { animationsDone } from "@/test/animations";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

import "@/styles/global.css";

describe("DropdownMenuContent", () => {
  it("keeps a gap from the window's edge when it is moved to fit", async () => {
    const user = userEvent.setup();
    render(
      <div style={{ position: "fixed", left: 4, top: 4 }}>
        <DropdownMenu>
          <DropdownMenuTrigger>•••</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-48">
            <DropdownMenuItem>A long enough item to be wider than its button</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "•••" }));

    const menu = await screen.findByRole("menu");
    await animationsDone(menu);

    expect(menu.getBoundingClientRect().left).toBeGreaterThanOrEqual(8);
  });
});
