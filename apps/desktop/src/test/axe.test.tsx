import { render } from "@testing-library/react";

import { expectNoAccessibilityViolations } from "./axe";

describe("expectNoAccessibilityViolations", () => {
  it("passes for accessible markup", async () => {
    const { container } = render(<button type="button">Save</button>);

    await expectNoAccessibilityViolations(container);
  });

  it("fails for an image without alternative text", async () => {
    // The missing alt text is the point of this test.
    // oxlint-disable-next-line jsx-a11y/alt-text
    const { container } = render(<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />);

    await expect(expectNoAccessibilityViolations(container)).rejects.toThrow(/image-alt/);
  });
});
