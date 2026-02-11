# AGENT.md

## Project Overview

`opencode-sfx` is an OpenCode plugin that plays short audio clips for key OpenCode events.
Instead of mapping each event to one file, the plugin maps each event to a folder and picks a random clip from that folder when the event fires.

Primary implementation lives in `src/index.ts`.

## Event Model

Supported events/folders:

- `sessionStart`
- `sessionCreated`
- `promptSubmit`
- `notification`
- `permission`
- `stop`

Runtime scans each event folder non-recursively and only considers `.ogg`, `.wav`, and `.mp3` files.

## Bootstrap Rules (Important)

On plugin startup:

1. Ensure `soundRoot` exists.
2. Ensure each event folder exists under the resolved config.
3. If `soundRoot` did not exist before startup (first bootstrap), copy the entire bundled `assets/` tree into `soundRoot`.

Bootstrap copy behavior:

- Recursive directory copy.
- Never delete files.
- Never overwrite existing files.
- Create missing destination directories as needed.

## Assets Convention

Bundled defaults are sourced from the repo `assets/` directory.
To change default out-of-box sounds, update files under `assets/` (especially event folders).

## Config Notes

- Config file: `~/.config/opencode/opencode-sfx.json`
- Key fields:
  - `enabled`
  - `playerCommand`
  - `playerArgs`
  - `events`
  - `soundRoot`
  - `eventFolders`

## Development Notes

- Keep file operations safe: do not remove user files during bootstrap.
- Preserve non-recursive event folder scanning behavior.
- Validate changes with:
  - `npm run typecheck`
  - `npm run build`
