# opencode-sfx

OpenCode plugin that plays your own sound effects for key agent moments.

## Installation

Add it to your OpenCode config, OpenCode will download/manage it for you:

```json
{
  "plugin": ["opencode-sfx"]
}
```

## Event Folders

Default sound root:

`~/.config/opencode/opencode-sfx/sounds`

On startup, the plugin checks whether this root and each event folder already exists before creating anything new. It never deletes existing files.

If `soundRoot` is missing on first bootstrap, the plugin copies the entire bundled `assets/` tree into `soundRoot` so event folders are prefilled out of the box.

Put one or more clips directly in each event folder (non-recursive):

| OpenCode event | Folder name |
|---|---|
| plugin load | `sessionStart/` |
| `session.created` | `sessionCreated/` |
| `tui.command.execute` (`prompt.submit`) | `promptSubmit/` |
| `permission.updated` (and `permission.ask`) | `permission/` |
| `session.error` | `notification/` |
| `session.status` (`status.type === "idle"`) | `stop/` |

Supported file types:

- `.ogg`
- `.wav`
- `.mp3`

When an event fires, one clip is chosen at random from that folder.

## Configuration

Optional config file:

`~/.config/opencode/opencode-sfx.json`

Minimal example:

```json
{
  "enabled": true
}
```

Full example:

```json
{
  "enabled": true,
  "soundRoot": "opencode-sfx/sounds",
  "playerCommand": "afplay",
  "playerArgs": [],
  "events": {
    "sessionStart": true,
    "sessionCreated": true,
    "promptSubmit": true,
    "notification": true,
    "permission": true,
    "stop": true
  },
  "eventFolders": {
    "sessionStart": "sessionStart",
    "sessionCreated": "sessionCreated",
    "promptSubmit": "promptSubmit",
    "notification": "notification",
    "permission": "permission",
    "stop": "stop"
  }
}
```

Config notes:

- If `playerCommand` is omitted, the plugin auto-detects a player:
  - macOS: `afplay`
  - Linux: `paplay`, then `aplay`, then `ffplay`
- Relative `soundRoot` paths are resolved from `~/.config/opencode/`.
- Relative `eventFolders` paths are resolved from `soundRoot`.
- Event folder scanning is non-recursive.

## Asset Source

Sample Warcraft clips in `assets/` come from:

- https://www.wowhead.com/sounds/name:peon
- https://www.wowhead.com/sounds/name:peasant

See `assets/README.md` for exact file list.

## License

Plugin code is MIT (`LICENSE`).

Game audio remains property of its original rights holders.
