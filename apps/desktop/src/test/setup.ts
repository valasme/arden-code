import "@testing-library/jest-dom/vitest";
import "@/i18n";

import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, configure } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach } from "vitest";

import { useDraftsStore } from "@/state/drafts";

// A slow machine, such as a CI runner, may take a while to draw a page in a real browser.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  clearMocks();
  // The toast list outlives a test, so a toast from one test would fade in over the next.
  toast.dismiss();
  // What one test wrote in a message box would be there in the next (ADR 0046).
  useDraftsStore.setState(useDraftsStore.getInitialState());
});
