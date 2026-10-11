import "@testing-library/jest-dom/vitest";
import "@/i18n";

import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, configure } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach } from "vitest";

import { useTranscriptViewsStore } from "@/features/sessions/transcriptView";

// A slow machine, such as a CI runner, may take a while to draw a page in a real browser.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  clearMocks();
  // The toast list outlives a test, so a toast from one test would fade in over the next.
  toast.dismiss();
  // A transcript view picked for a session in one test would show in the next (ADR 0051).
  useTranscriptViewsStore.setState(useTranscriptViewsStore.getInitialState());
});
