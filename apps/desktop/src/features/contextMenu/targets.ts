/** What a context menu is about. */
export type MenuTarget =
  | { kind: "field"; element: HTMLInputElement | HTMLTextAreaElement }
  | { kind: "editable"; element: HTMLElement }
  | { kind: "selection"; element: HTMLElement };

/** Input types that hold text a person can select and edit. */
const textInputTypes = new Set(["text", "search", "url", "tel", "email", "password", "number", ""]);

/** The text field, editable area or selected text that a menu on `node` would be about, if any. */
export function menuTargetOf(node: EventTarget | null): MenuTarget | undefined {
  const element = node instanceof Element ? node : null;
  if (!element) return undefined;

  const field = element.closest("input, textarea");
  if (field instanceof HTMLTextAreaElement) return { kind: "field", element: field };
  if (field instanceof HTMLInputElement && textInputTypes.has(field.type)) {
    return { kind: "field", element: field };
  }
  const editable = element.closest<HTMLElement>('[contenteditable]:not([contenteditable="false"])');
  if (editable) return { kind: "editable", element: editable };
  if (selectedText() !== "" && element instanceof HTMLElement) {
    return { kind: "selection", element };
  }
  return undefined;
}

/** The text a person has selected in a field or on the page. */
export function selectedTextIn(target: MenuTarget): string {
  if (target.kind === "field") {
    const { element } = target;
    return element.value.slice(element.selectionStart ?? 0, element.selectionEnd ?? 0);
  }
  return selectedText();
}

function selectedText(): string {
  return window.getSelection()?.toString() ?? "";
}

/** What can be done with the target now. */
export interface MenuState {
  cut: boolean;
  copy: boolean;
  paste: boolean;
  selectAll: boolean;
}

export function menuStateOf(target: MenuTarget): MenuState {
  const hasSelection = selectedTextIn(target) !== "";
  if (target.kind === "selection") {
    return { cut: false, copy: hasSelection, paste: false, selectAll: false };
  }
  const editable =
    target.kind === "field"
      ? !target.element.readOnly && !target.element.disabled
      : target.element.isContentEditable;
  // A password is never put on the clipboard.
  const secret = target.kind === "field" && target.element.type === "password";
  return {
    cut: hasSelection && editable && !secret,
    copy: hasSelection && !secret,
    paste: editable,
    selectAll: true,
  };
}
