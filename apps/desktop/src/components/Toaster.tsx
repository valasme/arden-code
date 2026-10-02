import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { cn } from "@/lib/utils";

import { buttonVariants } from "./ui/button";

/** Sonner places toasts by these; in rem, the zoom moves them too. Bottom clears the status bar. */
const offset = { right: "1rem", bottom: "2.5rem", left: "1rem" };

/** Sonner's width for the toasts, in place of its 356px. */
const width: CSSProperties & { "--width": string } = { "--width": "22rem" };

/**
 * Toasts, drawn with the app's own parts instead of Sonner's: the popover surface with a 1px border
 * and square corners, Inter, 16px icons (an error's in the destructive color), an action like the
 * app's outline button, and a close button inside each toast. They are 22rem wide, so they grow with
 * the zoom. Their motion and focus outline are set in base.css, where Sonner's own rules are.
 */
export function Toaster(props: ToasterProps) {
  const { t } = useTranslation();

  return (
    <Sonner
      // Sonner's theme only picks Sonner's colors, and in dark some of them reach even an unstyled
      // toast. The app's tokens do the theming, so Sonner keeps its light theme.
      theme="light"
      closeButton
      customAriaLabel={t("notices.region")}
      style={width}
      offset={offset}
      mobileOffset={offset}
      gap={8}
      icons={{
        success: <CircleCheckIcon aria-hidden className="size-4" strokeWidth={1.5} />,
        info: <InfoIcon aria-hidden className="size-4" strokeWidth={1.5} />,
        warning: <TriangleAlertIcon aria-hidden className="size-4" strokeWidth={1.5} />,
        error: <OctagonXIcon aria-hidden className="size-4" strokeWidth={1.5} />,
        loading: <Loader2Icon aria-hidden className="size-4 animate-spin" strokeWidth={1.5} />,
        close: <XIcon aria-hidden className="size-4" strokeWidth={1.5} />,
      }}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: t("notices.close"),
        classNames: {
          // Behind the front toast, a collapsed stack shows only its edges.
          toast:
            "group/toast grid w-(--width) grid-cols-[auto_minmax(0,1fr)_auto] items-start border border-border bg-popover p-3 font-sans text-sm text-popover-foreground shadow-lg data-[expanded=false]:data-[front=false]:*:opacity-0",
          icon: "relative col-start-1 row-start-1 me-2.5 flex h-lh items-center group-data-[type=error]/toast:text-destructive",
          content: "col-start-2 row-start-1 flex min-w-0 flex-col gap-0.5",
          title: "font-medium",
          description: "text-xs text-muted-foreground",
          actionButton: cn(
            buttonVariants({ variant: "outline", size: "xs" }),
            "col-start-2 row-start-2 mt-2 justify-self-start",
          ),
          closeButton:
            "col-start-3 row-start-1 -me-1.5 -mt-0.5 ms-2 grid size-6 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground",
        },
      }}
      {...props}
    />
  );
}
