import { renderHook } from "@testing-library/react";

import { useTauriListener } from "./useTauriListener";

/** A pretend Tauri listener: it starts when asked, and says how many are still listening. */
function pretendListener() {
  let listening = 0;
  let started = 0;
  let finishStarting: (() => void) | undefined;
  const stop = () => {
    listening -= 1;
  };
  const listen = (delayed = false) => {
    started += 1;
    if (!delayed) {
      listening += 1;
      return Promise.resolve(stop);
    }
    return new Promise<() => void>((resolve) => {
      finishStarting = () => {
        listening += 1;
        resolve(stop);
      };
    });
  };
  return {
    listen,
    listening: () => listening,
    started: () => started,
    finishStarting: () => finishStarting?.(),
  };
}

beforeEach(() => {
  Object.assign(globalThis, { isTauri: true });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("useTauriListener", () => {
  it("listens once while the component is on screen, and stops when it goes", async () => {
    const listener = pretendListener();
    const { rerender, unmount } = renderHook(() => {
      useTauriListener(() => listener.listen());
    });
    await vi.waitFor(() => {
      expect(listener.listening()).toBe(1);
    });

    rerender();
    rerender();
    expect(listener.started()).toBe(1);

    unmount();
    expect(listener.listening()).toBe(0);
  });

  it("stops a listener that only finished starting after the component went", async () => {
    const listener = pretendListener();
    const { unmount } = renderHook(() => {
      useTauriListener(() => listener.listen(true));
    });

    unmount();
    listener.finishStarting();

    await vi.waitFor(() => {
      expect(listener.started()).toBe(1);
    });
    await Promise.resolve();
    expect(listener.listening()).toBe(0);
  });

  it("does not listen while it is not enabled, or outside Tauri", () => {
    const listener = pretendListener();
    renderHook(() => {
      useTauriListener(() => listener.listen(), false);
    });
    Reflect.deleteProperty(globalThis, "isTauri");
    renderHook(() => {
      useTauriListener(() => listener.listen());
    });

    expect(listener.started()).toBe(0);
  });
});
