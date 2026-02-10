import type { Plugin } from "@opencode-ai/plugin"
import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

type SoundEvent = "sessionStart" | "promptSubmit" | "notification" | "stop"
type VoicePack = "peon" | "peasant"

interface SfxConfig {
  enabled: boolean
  voicePack: VoicePack
  playerCommand: string | null
  playerArgs: string[]
  events: Record<SoundEvent, boolean>
  sounds: Partial<Record<SoundEvent, string>>
}

interface LoadConfigResult {
  config: SfxConfig
  warnings: string[]
}

interface PlayerCommand {
  command: string
  args: string[]
}

interface ResolvePlayerResult {
  player: PlayerCommand | null
  warning: string | null
}

const SERVICE_NAME = "opencode-sfx"
const CONFIG_PATH = join(homedir(), ".config", "opencode", "opencode-sfx.json")
const SOUND_EVENTS: SoundEvent[] = [
  "sessionStart",
  "promptSubmit",
  "notification",
  "stop",
]

const DEFAULT_EVENTS: Record<SoundEvent, boolean> = {
  sessionStart: true,
  promptSubmit: true,
  notification: true,
  stop: true,
}

const DEFAULT_CONFIG: SfxConfig = {
  enabled: true,
  voicePack: "peon",
  playerCommand: null,
  playerArgs: [],
  events: { ...DEFAULT_EVENTS },
  sounds: {},
}

function bundledSoundPath(relativePath: string): string {
  return fileURLToPath(new URL(`../assets/${relativePath}`, import.meta.url))
}

const BUNDLED_SOUNDS: Record<VoicePack, Record<SoundEvent, string>> = {
  peon: {
    sessionStart: bundledSoundPath("peon/PeonReady1.ogg"),
    promptSubmit: bundledSoundPath("peon/PeonYes3.ogg"),
    notification: bundledSoundPath("peon/PeonWhat3.ogg"),
    stop: bundledSoundPath("peon/PeonBuildingComplete1.ogg"),
  },
  peasant: {
    sessionStart: bundledSoundPath("peasant/PeasantReady1.ogg"),
    promptSubmit: bundledSoundPath("peasant/PeasantYes3.ogg"),
    notification: bundledSoundPath("peasant/PeasantWhat3.ogg"),
    stop: bundledSoundPath("peasant/PeasantYes4.ogg"),
  },
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeConfiguredPath(pathValue: string): string {
  if (isAbsolute(pathValue)) {
    return pathValue
  }

  return resolve(dirname(CONFIG_PATH), pathValue)
}

function loadConfig(): LoadConfigResult {
  if (!existsSync(CONFIG_PATH)) {
    return {
      config: {
        ...DEFAULT_CONFIG,
        events: { ...DEFAULT_EVENTS },
        sounds: {},
      },
      warnings: [],
    }
  }

  try {
    const fileContent = readFileSync(CONFIG_PATH, "utf-8")
    const parsed = JSON.parse(fileContent) as unknown

    if (!isObject(parsed)) {
      throw new Error("Configuration must be a JSON object")
    }

    const rawEvents = isObject(parsed.events) ? parsed.events : {}
    const rawSounds = isObject(parsed.sounds) ? parsed.sounds : {}

    const config: SfxConfig = {
      enabled:
        typeof parsed.enabled === "boolean"
          ? parsed.enabled
          : DEFAULT_CONFIG.enabled,
      voicePack: parsed.voicePack === "peasant" ? "peasant" : "peon",
      playerCommand: optionalString(parsed.playerCommand) ?? null,
      playerArgs: Array.isArray(parsed.playerArgs)
        ? parsed.playerArgs.filter(
            (value): value is string => typeof value === "string"
          )
        : [],
      events: {
        sessionStart:
          typeof rawEvents.sessionStart === "boolean"
            ? rawEvents.sessionStart
            : DEFAULT_EVENTS.sessionStart,
        promptSubmit:
          typeof rawEvents.promptSubmit === "boolean"
            ? rawEvents.promptSubmit
            : DEFAULT_EVENTS.promptSubmit,
        notification:
          typeof rawEvents.notification === "boolean"
            ? rawEvents.notification
            : DEFAULT_EVENTS.notification,
        stop:
          typeof rawEvents.stop === "boolean"
            ? rawEvents.stop
            : DEFAULT_EVENTS.stop,
      },
      sounds: {
        sessionStart: optionalString(rawSounds.sessionStart),
        promptSubmit: optionalString(rawSounds.promptSubmit),
        notification: optionalString(rawSounds.notification),
        stop: optionalString(rawSounds.stop),
      },
    }

    for (const eventName of SOUND_EVENTS) {
      const configuredPath = config.sounds[eventName]
      if (configuredPath) {
        config.sounds[eventName] = normalizeConfiguredPath(configuredPath)
      }
    }

    return { config, warnings: [] }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error"
    return {
      config: {
        ...DEFAULT_CONFIG,
        events: { ...DEFAULT_EVENTS },
        sounds: {},
      },
      warnings: [`Failed to parse ${CONFIG_PATH}: ${message}`],
    }
  }
}

function resolveSoundMap(config: SfxConfig): Record<SoundEvent, string> {
  const bundled = BUNDLED_SOUNDS[config.voicePack]

  return {
    sessionStart: config.sounds.sessionStart ?? bundled.sessionStart,
    promptSubmit: config.sounds.promptSubmit ?? bundled.promptSubmit,
    notification: config.sounds.notification ?? bundled.notification,
    stop: config.sounds.stop ?? bundled.stop,
  }
}

function isBareCommand(command: string): boolean {
  return !command.includes("/") && !command.includes("\\")
}

function commandExists(command: string): boolean {
  const checker = process.platform === "win32" ? "where" : "which"
  const result = spawnSync(checker, [command], { stdio: "ignore" })
  return result.status === 0
}

function resolvePlayer(config: SfxConfig): ResolvePlayerResult {
  if (config.playerCommand) {
    if (isBareCommand(config.playerCommand) && !commandExists(config.playerCommand)) {
      return {
        player: null,
        warning: `Configured playerCommand \"${config.playerCommand}\" was not found in PATH.`,
      }
    }

    return {
      player: {
        command: config.playerCommand,
        args: config.playerArgs,
      },
      warning: null,
    }
  }

  if (process.platform === "darwin" && commandExists("afplay")) {
    return {
      player: {
        command: "afplay",
        args: [],
      },
      warning: null,
    }
  }

  if (process.platform === "linux") {
    if (commandExists("paplay")) {
      return {
        player: {
          command: "paplay",
          args: [],
        },
        warning: null,
      }
    }

    if (commandExists("aplay")) {
      return {
        player: {
          command: "aplay",
          args: [],
        },
        warning: null,
      }
    }

    if (commandExists("ffplay")) {
      return {
        player: {
          command: "ffplay",
          args: ["-loglevel", "quiet", "-nodisp", "-autoexit"],
        },
        warning: null,
      }
    }
  }

  return {
    player: null,
    warning: `No audio player found. Install afplay (macOS) or paplay/aplay/ffplay (Linux), or set playerCommand in ${CONFIG_PATH}.`,
  }
}

export const WarcraftSfxPlugin: Plugin = async ({ client }) => {
  const { config, warnings } = loadConfig()
  const { player, warning } = resolvePlayer(config)
  const sounds = resolveSoundMap(config)
  const missingSoundWarnings = new Set<SoundEvent>()
  const activeSessions = new Set<string>()

  const log = async (level: "warn" | "error", message: string) => {
    try {
      await client.app.log({
        body: {
          service: SERVICE_NAME,
          level,
          message,
        },
      })
    } catch {
      return
    }
  }

  for (const entry of warnings) {
    await log("warn", entry)
  }

  if (warning) {
    await log("warn", warning)
  }

  const play = (eventName: SoundEvent) => {
    if (!config.enabled || !config.events[eventName] || !player) {
      return
    }

    const soundPath = sounds[eventName]

    if (!existsSync(soundPath)) {
      if (!missingSoundWarnings.has(eventName)) {
        missingSoundWarnings.add(eventName)
        void log("warn", `Missing sound file for \"${eventName}\": ${soundPath}`)
      }
      return
    }

    const child = spawn(player.command, [...player.args, soundPath], {
      stdio: "ignore",
    })

    child.on("error", (error) => {
      const message = error instanceof Error ? error.message : "unknown error"
      void log("error", `Failed to play \"${eventName}\" sound: ${message}`)
    })

    child.unref()
  }

  play("sessionStart")

  return {
    event: async ({ event }) => {
      if (
        event.type === "tui.command.execute" &&
        event.properties.command === "prompt.submit"
      ) {
        play("promptSubmit")
        return
      }

      if (event.type === "session.status") {
        const { sessionID, status } = event.properties

        if (status.type === "idle") {
          if (activeSessions.has(sessionID)) {
            activeSessions.delete(sessionID)
            play("stop")
          }

          return
        }

        activeSessions.add(sessionID)
        return
      }

      if (event.type === "session.error") {
        play("notification")
      }
    },
    "permission.ask": async () => {
      play("notification")
    },
  }
}

export default WarcraftSfxPlugin
