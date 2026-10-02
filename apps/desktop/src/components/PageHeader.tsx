import { useEffect, useRef } from "react";

interface PageHeaderProps {
  title: string;
  /** A line under the title saying what the page is for. */
  description?: string;
  /** Moves the focus to the title when the page opens, as an error screen does. */
  focusOnOpen?: boolean;
}

/**
 * The top of a page (ADR 0032): Settings, the log viewer and the error screens share it, a 20px
 * title over a muted line.
 */
export function PageHeader({ title, description, focusOnOpen = false }: PageHeaderProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusOnOpen) heading.current?.focus();
  }, [focusOnOpen]);

  return (
    <div className="mb-6 flex flex-col gap-1">
      <h1
        ref={heading}
        {...(focusOnOpen ? { tabIndex: -1 } : {})}
        className="text-xl font-semibold text-balance outline-none"
      >
        {title}
      </h1>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
