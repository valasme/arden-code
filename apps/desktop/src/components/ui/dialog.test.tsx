import { render, screen } from "@testing-library/react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

import "@/styles/global.css";

describe("Dialog", () => {
  it("lays a flat tint over the page, with nothing behind it blurred", async () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Reset settings?</DialogTitle>
          <DialogDescription>Every setting goes back to its default.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    await screen.findByRole("dialog", { name: "Reset settings?" });
    const overlay = document.querySelector("[data-slot=dialog-overlay]");
    if (!overlay) throw new Error("the dialog has no overlay");

    expect(getComputedStyle(overlay).backdropFilter).toBe("none");
    expect(getComputedStyle(overlay).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });
});
