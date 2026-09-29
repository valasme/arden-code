import { expect, test } from "./fixtures";

test("the real app shows its name and version from Rust", async ({ appPage }) => {
  await expect(appPage).toHaveTitle("Arden Code");
  await expect(appPage.getByRole("heading", { level: 1 })).toHaveText(/^Arden Code \d+\.\d+\.\d+$/);
});
