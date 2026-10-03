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
| `ARD-APP-003` | Arden Code could not get ready to reset itself | Settings → Advanced → Reset Arden Code |
| `ARD-APP-004` | A link was not opened: it is not allowed, or Windows could not open it | Choosing a link in an agent's reply |
| `ARD-APP-005` | A notification could not be shown | Settings → Notifications → Send a test notification |
| `ARD-APP-006` | A reset could not finish, so the settings were kept and the next start tries again | Starting the app after Settings → Advanced → Reset Arden Code |
| `ARD-SET-001` | The settings could not be saved | Changing any setting |
| `ARD-SET-002` | The settings file was not valid, so defaults are in use | Starting the app, or editing `settings.json` by hand |
| `ARD-SET-003` | A settings file could not be imported | Settings → Advanced → Import settings |
| `ARD-SET-004` | The settings could not be exported | Settings → Advanced → Export settings |
| `ARD-SET-005` | `settings.json` could not be opened | Settings → Advanced → Open settings.json |
| `ARD-LOG-001` | The logs folder could not be opened | Settings → Advanced → Open logs; the error screen's "Open logs" |
| `ARD-LOG-002` | The diagnostics bundle could not be written | Settings → Advanced → Export diagnostics; after a crash |
| `ARD-AGT-001` | A session or project does not exist any more | Sending a message, or opening a session |
| `ARD-AGT-002` | A message was sent while the agent was still answering the last one | Sending a message |
| `ARD-AGT-003` | The sessions could not be saved, so they last only until Arden Code closes | Starting the app; anything that changes a session |
| `ARD-AGT-004` | The saved sessions could not be read, so Arden Code started without them | Starting the app; opening a session |
| `ARD-AGT-006` | A name given to a session is empty or too long | Renaming a session |
| `ARD-PROC-001` | Programs cannot be started and supervised on this computer | Settings → Agents; starting an agent |
| `ARD-UPD-001` | The update could not be installed | Choosing "Update ready: restart" |
| `ARD-WIN-001` | Windows' window menu could not be opened | The title bar's Window menu button and Alt+Space |
| `ARD-WIN-002` | The web engine that draws the window stopped and was started again | The web engine's process crashed or stopped answering |

## How an error travels

1. A command fails in Rust with an `AppError`: a code, a translation key and optional details.
2. The UI receives it as a rejected promise. Through Tauri's isolation pattern it arrives as JSON text, and
   `toAppError` in `src/lib/errors.ts` turns that back into an object. Anything that is not an `AppError` becomes
   `ARD-APP-002`.
3. A failing page shows the error screen with the code, what happened, why and what to do, plus **Copy details**,
   **Reload** and **Open logs**. Errors nobody handled show as a notice instead.
4. Both write the code to the log, so it can be found from a screenshot.
5. **Copy details** asks Rust to remove private information before the text reaches the clipboard.
