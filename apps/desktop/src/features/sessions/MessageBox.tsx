import { SendIcon } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** The key code some browsers report for a key that is part of an input method's composition. */
const COMPOSING_KEY_CODE = 229;

/**
 * Where the person writes. Enter sends and Shift+Enter adds a line. Enter never sends while a
 * character is still being composed (an accent key, an input method for another script): that
 * Enter confirms the character.
 */
export function MessageBox({ busy, onSend }: { busy: boolean; onSend: (text: string) => void }) {
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
    <div data-area="messagebox" className="flex items-end gap-2 border-t border-border p-3">
      <Textarea
        ref={box}
        data-message-box
        aria-label={t("sessions.messageBox.label")}
        placeholder={t("sessions.messageBox.placeholder")}
        spellCheck
        rows={1}
        className="max-h-48 min-h-9 flex-1 resize-none"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      <Button aria-label={t("sessions.messageBox.send")} disabled={!canSend} onClick={send}>
        <SendIcon aria-hidden className="size-4" strokeWidth={1.5} />
      </Button>
    </div>
  );
}
