import axe from "axe-core";

/** Fails the test with a readable list when the rendered markup has WCAG 2.2 AA violations. */
export async function expectNoAccessibilityViolations(container: Element) {
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
  });
  if (results.violations.length > 0) {
    const lines = results.violations.map(
      (violation) => `- ${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`,
    );
    throw new Error(`Accessibility violations:\n${lines.join("\n")}`);
  }
}
