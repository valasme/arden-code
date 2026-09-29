# Error codes

Every error a user can see has a code of the form `ARD-<AREA>-<NNN>`. The same code appears on the
error screen and in the logs, so it can be traced from a screenshot. The codes are defined in
`crates/arden-core/src/error.rs`, and a test checks that this page lists exactly the codes the code defines.

Areas: `APP` (the app itself), `SET` (settings), `IPC` (calls between the UI and Rust), `LOG` (logging and
diagnostics), `PROC` (child processes), `AGT` (agents), `UPD` (updates), `WIN` (Windows integration), `FS`
(files and folders).

To add a code: add it to the enum, give it an entry under `errors` in `en-US.json` (what happened, why, and what to
do), and add a row here. Never reuse or renumber a code.

| Code | What happened | Where it comes from |
|---|---|---|
| `ARD-APP-001` | Something unexpected went wrong inside the app | Any command that fails in a way nobody planned for |
| `ARD-APP-002` | The interface hit an error it could not handle | An uncaught error or rejected promise in the UI |
| `ARD-LOG-001` | The logs folder could not be opened | Settings → Advanced → Open logs; the error screen's "Open logs" |
| `ARD-WIN-001` | Windows' window menu could not be opened | The title bar's logo button and Alt+Space |

## How an error travels

1. A command fails in Rust with an `AppError`: a code, a translation key and optional details.
2. The UI receives it as a rejected promise. Through Tauri's isolation pattern it arrives as JSON text, and
   `toAppError` in `src/lib/errors.ts` turns that back into an object. Anything that is not an `AppError` becomes
   `ARD-APP-002`.
3. A failing page shows the error screen with the code, what happened, why and what to do, plus **Copy details**,
   **Reload** and **Open logs**. Errors nobody handled show as a notice instead.
4. Both write the code to the log, so it can be found from a screenshot.
5. **Copy details** asks Rust to remove private information before the text reaches the clipboard.
