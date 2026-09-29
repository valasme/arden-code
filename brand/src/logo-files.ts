/** The SVG masters: every shape in every color variant. */

import { variants } from "./colors.ts";
import { buildShapes, type Shape } from "./lockups.ts";

const title = "Arden Code";

function toSvg(shape: Shape, colors: { mark: string; wordmark: string }): string {
  const paths = shape.parts
    .map((part) => `<path fill="${colors[part.role]}" d="${part.path}"/>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${shape.width} ${shape.height}" ` +
    `width="${shape.width}" height="${shape.height}" role="img" aria-label="${title}">` +
    `<title>${title}</title>${paths}</svg>\n`
  );
}

/** File name to SVG markup, for example `logo-horizontal-color-on-dark.svg`. */
export function buildLogoFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [shapeName, shape] of Object.entries(buildShapes())) {
    for (const [variantName, colors] of Object.entries(variants)) {
      files[`${shapeName}-${variantName}.svg`] = toSvg(shape, colors);
    }
  }
  return files;
}
