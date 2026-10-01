import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import { logoShapes } from "./logo-shapes.gen";

type ShapeName = keyof typeof logoShapes;

interface ShapeProps extends Omit<ComponentProps<"svg">, "children"> {
  /** Hide the logo from screen readers, for when the name is written out next to it. */
  decorative?: boolean;
}

/** The logo's colors come from the theme, so it follows light and dark. */
const inks = { mark: "var(--brand)", wordmark: "var(--brand-wordmark)" } as const;

function Shape({ shape, decorative = false, ...props }: ShapeProps & { shape: ShapeName }) {
  const { t } = useTranslation();
  const { width, height, parts } = logoShapes[shape];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : t("brand.name")}
      aria-hidden={decorative ? true : undefined}
      {...props}
    >
      {parts.map((part) => (
        <path key={part.role} fill={inks[part.role]} d={part.path} />
      ))}
    </svg>
  );
}

/** The symbol on its own: the orange grid of rounded cells. */
export function Mark(props: ShapeProps) {
  return <Shape shape="mark" {...props} />;
}

/** The words "Arden Code" as outlines. */
export function Wordmark(props: ShapeProps) {
  return <Shape shape="wordmark" {...props} />;
}

interface LogoProps extends ShapeProps {
  orientation?: "horizontal" | "stacked";
}

/** The mark and the wordmark together. */
export function Logo({ orientation = "horizontal", ...props }: LogoProps) {
  return (
    <Shape shape={orientation === "stacked" ? "logo-stacked" : "logo-horizontal"} {...props} />
  );
}
