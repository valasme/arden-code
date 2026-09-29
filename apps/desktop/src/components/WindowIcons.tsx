import type { ComponentProps } from "react";

/** The caption button glyphs Windows 11 uses: 10 px, thin, and drawn on the pixel grid. */
function Glyph(props: ComponentProps<"svg">) {
  return (
    <svg
      aria-hidden
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      shapeRendering="crispEdges"
      {...props}
    />
  );
}

export function MinimizeGlyph() {
  return (
    <Glyph>
      <path d="M0 5.5h10" />
    </Glyph>
  );
}

export function MaximizeGlyph() {
  return (
    <Glyph>
      <rect x="0.5" y="0.5" width="9" height="9" />
    </Glyph>
  );
}

export function RestoreGlyph() {
  return (
    <Glyph>
      <path d="M2.5 2.5V0.5h7v7h-2" />
      <rect x="0.5" y="2.5" width="7" height="7" />
    </Glyph>
  );
}

export function CloseGlyph() {
  return (
    <Glyph shapeRendering="auto">
      <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
    </Glyph>
  );
}
