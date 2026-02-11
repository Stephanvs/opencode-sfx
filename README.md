# opencode-sfx

OpenCode plugin that plays Warcraft worker voice lines for key agent moments, inspired by classic RTS feedback sounds.

Bundled voice packs:

- `peon` (Orc worker)
- `peasant` (Human worker)

## Installation

Add it to your OpenCode config, OpenCode will download/manage it for you:

```json
{
  "plugin": ["opencode-sfx"]
}
```

## Default Event Mapping

| OpenCode event | Default sound (`peon`) |
|---|---|
| plugin load | `PeonYes4.ogg` |
| `session.created` | `PeonYes4.ogg` |
| `tui.command.execute` (`prompt.submit`) | `PeonYes3.ogg` |
| `permission.updated` (and `permission.ask`) | `PeonWhat4.ogg` |
| `session.error` | `PeonWhat3.ogg` |
| `session.status` (`status.type === "idle"`) | `PeonBuildingComplete1.ogg` |

## Configuration

Optional config file:

`~/.config/opencode/opencode-sfx.json`

Minimal example:

```json
{
  "voicePack": "peon"
}
```

Full example:

```json
{
  "enabled": true,
  "voicePack": "peasant",
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
  "sounds": {
    "sessionStart": "/absolute/path/to/start.ogg",
    "sessionCreated": "/absolute/path/to/session-created.ogg",
    "promptSubmit": "custom/prompt.ogg",
    "notification": "/absolute/path/to/notification.ogg",
    "permission": "/absolute/path/to/permission.ogg",
    "stop": "/absolute/path/to/stop.ogg"
  }
}
```

Config notes:

- If `playerCommand` is omitted, the plugin auto-detects a player:
  - macOS: `afplay`
  - Linux: `paplay`, then `aplay`, then `ffplay`
- Relative paths in `sounds` are resolved from `~/.config/opencode/`.
- Any sound not overridden in `sounds` falls back to the selected `voicePack`.

## Asset Source

Bundled clips come from:

- https://www.wowhead.com/sounds/name:peon
- https://www.wowhead.com/sounds/name:peasant

See `assets/README.md` for exact file list.

## License

Plugin code is MIT (`LICENSE`).

Game audio remains property of its original rights holders.
