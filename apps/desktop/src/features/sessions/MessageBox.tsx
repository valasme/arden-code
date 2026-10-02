import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** The key code some browsers report for a key that is part of an input method's composition. */
const COMPOSING_KEY_CODE = 229;

interface MessageBoxProps {
  /** Whether a reply is running: then the button stops it instead of sending. */
  busy: boolean;
  /** Who the message goes to and where, such as "Demo agent · Playground". */
  context: string;
  onSend: (text: string) => void;
  onStop: () => void;
}

/**
 * Where the person writes (ADR 0032): a block at least two lines tall, naming the agent and the
 * project under the text, with Send, or Stop while a reply runs. Enter sends and Shift+Enter adds
 * a line. Enter never sends while a character is still being composed (an accent key, an input
 * method for another script): that Enter confirms the character.
 */
export function MessageBox({ busy, context, onSend, onStop }: MessageBoxProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  // A session opens ready to be written in.
  useEffect(() => {
    box.current?.focus();
  }, []);
  const canSend = !busy && text.trim() !== "";

  const send = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.keyCode === COMPOSING_KEY_CODE) return;
    event.preventDefault();
    send();
  };

  return (
    <div data-area="messagebox" className="shrink-0 px-6 pb-4">
      <div
        data-message-frame
        className="mx-auto flex max-w-[45rem] flex-col border border-input bg-background"
      >
        <Textarea
          ref={box}
          data-message-box
          aria-label={t("sessions.messageBox.label")}
          placeholder={t("sessions.messageBox.placeholder")}
          spellCheck
          rows={2}
          className="max-h-48 min-h-16 resize-none border-0 bg-transparent px-3 pt-3 pb-1 text-base md:text-base dark:bg-transparent"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="flex items-center gap-2 ps-3 pe-2 pb-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{context}</span>
          {busy ? (
            <Button
              variant="outline"
              size="sm"
              className="ms-auto"
              aria-label={t("sessions.messageBox.stop")}
              onClick={onStop}
            >
              <SquareIcon aria-hidden strokeWidth={1.5} />
              {t("sessions.messageBox.stopShort")}
            </Button>
          ) : (
            <Button
              size="icon-sm"
              className="ms-auto"
              aria-label={t("sessions.messageBox.send")}
              disabled={!canSend}
              onClick={send}
            >
              <ArrowUpIcon aria-hidden strokeWidth={1.5} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
