import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { commands } from "@/ipc/bindings";
import { toAppError } from "@/lib/errors";

interface ErrorsPlaygroundProps {
  /** Draws nothing but an error, to show what a failing page looks like. */
  failToDraw: boolean;
  onFailToDraw: () => void;
}

/**
 * Makes each kind of failure happen on purpose, for testing and for seeing what the user would.
 * Development builds only.
 */
export function ErrorsPlayground({ failToDraw, onFailToDraw }: ErrorsPlaygroundProps) {
  const [commandError, setCommandError] = useState<string>();
  const navigate = useNavigate();

  if (failToDraw) {
    throw new Error("Deliberate error while drawing the page");
  }

  return (
    <main className="flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Errors</h1>
      <p className="text-sm text-muted-foreground">
        Each button makes one kind of failure happen. Look at the screen, the notice and the log.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onFailToDraw}>
          Fail while drawing
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            void Promise.reject(new Error("Deliberate unhandled rejection"));
          }}
        >
          Reject a promise
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setTimeout(() => {
              throw new Error("Deliberate uncaught error");
            });
          }}
        >
          Throw an uncaught error
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            commands.debugFail().catch((failure: unknown) => {
              const error = toAppError(failure);
              setCommandError(`${error.code}: ${error.details ?? ""}`);
            });
          }}
        >
          Fail a command
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            void commands.debugPanic();
          }}
        >
          Panic on a Rust thread
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            commands
              .debugFillSession(10_000)
              .then((session) => navigate({ to: "/session/$id", params: { id: session.id } }))
              .catch((failure: unknown) => {
                setCommandError(toAppError(failure).code);
              });
          }}
        >
          Make a session of 10,000 messages
        </Button>
      </div>
      {commandError ? (
        <output className="text-sm">The command failed with {commandError}</output>
      ) : null}
    </main>
  );
}
