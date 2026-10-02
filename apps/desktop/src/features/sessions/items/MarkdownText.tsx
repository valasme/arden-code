import { code } from "@streamdown/code";
import { type ComponentProps, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Streamdown } from "streamdown";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { commands } from "@/ipc/bindings";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

import { classifyLink } from "../linkKind";

const plugins = { code };

/** The copy buttons stay; nothing is offered that saves a file or opens a bigger view. */
const controls = {
  code: { copy: true, download: false },
  table: { copy: true, download: false, fullscreen: false },
  mermaid: false,
  image: false,
} as const;

/**
 * A link in an agent's reply. A web address opens in the default browser; another kind asks the
 * person first; some are never opened and are shown as plain text. The address is written in the
 * link, so people can see where it goes, but a click never navigates the app's own window.
 */
function SafeLink({ href, children }: ComponentProps<"a">) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const kind = classifyLink(href ?? "");

  if (href === undefined || kind === "blocked") {
    return (
      <span className="underline decoration-dotted">
        {children}
        <span className="sr-only"> ({t("markdown.link.blocked")})</span>
      </span>
    );
  }

  const open = (confirmed: boolean) => {
    commands.openLink(href, confirmed).catch((error: unknown) => {
      showErrorToast(toAppError(error));
    });
  };

  return (
    <>
      <a
        href={href}
        rel="noreferrer noopener"
        title={href}
        className="text-primary underline underline-offset-2"
        onClick={(event) => {
          event.preventDefault();
          if (kind === "open") open(false);
          else setAsking(true);
        }}
        onAuxClick={(event) => {
          event.preventDefault();
        }}
      >
        {children}
      </a>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={t("markdown.link.confirmTitle")}
        description={t("markdown.link.confirmDescription", { url: href })}
        confirmLabel={t("markdown.link.open")}
        onConfirm={() => {
          open(true);
        }}
      />
    </>
  );
}

/** Images are never loaded: a picture from the internet is a way to track the person. */
function BlockedImage({ alt }: ComponentProps<"img">) {
  const { t } = useTranslation();

  return (
    <span className="inline-block border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
      {alt ? t("markdown.image.blockedWithName", { name: alt }) : t("markdown.image.blocked")}
    </span>
  );
}

const components = { a: SafeLink, img: BlockedImage };

/**
 * An agent's text, as Markdown. Raw HTML in it is dropped, images are not loaded, links are
 * handled by [`SafeLink`], and code is highlighted and can be copied.
 */
export function MarkdownText({ text, streaming }: { text: string; streaming: boolean }) {
  const { t } = useTranslation();
  const translations = useMemo(
    () => ({
      copyCode: t("markdown.copyCode"),
      copied: t("markdown.copied"),
      copyTable: t("markdown.copyTable"),
      copyTableAsCsv: t("markdown.copyTableAsCsv"),
      copyTableAsMarkdown: t("markdown.copyTableAsMarkdown"),
      copyTableAsTsv: t("markdown.copyTableAsTsv"),
    }),
    [t],
  );

  const box = useRef<HTMLDivElement>(null);

  // Code and tables scroll when they are wider than the text. A person who uses the keyboard must
  // be able to reach them to scroll, so they become a stop on the Tab key, with a name.
  useEffect(() => {
    const element = box.current;
    if (!element) return undefined;
    const mark = () => {
      const regions = element.querySelectorAll<HTMLElement>(
        '[data-streamdown="code-block-body"], [data-streamdown="table-wrapper"]',
      );
      for (const region of regions) {
        if (region.hasAttribute("tabindex")) continue;
        const isCode = region.dataset["streamdown"] === "code-block-body";
        region.tabIndex = 0;
        region.setAttribute("role", "region");
        region.setAttribute(
          "aria-label",
          isCode
            ? t("markdown.codeRegion", { language: region.dataset["language"] ?? "" })
            : t("markdown.tableRegion"),
        );
      }
    };
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(element, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, [t]);

  return (
    <div ref={box}>
      <Streamdown
        mode={streaming ? "streaming" : "static"}
        isAnimating={streaming}
        plugins={plugins}
        controls={controls}
        components={components}
        translations={translations}
        skipHtml
        linkSafety={{ enabled: false }}
        className="markdown py-1 text-base"
      >
        {text}
      </Streamdown>
    </div>
  );
}
