import type { Plugin } from "@opencode-ai/plugin"
import { spawn, spawnSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  type Dirent,
} from "node:fs"
import { homedir } from "node:os"
import { dirname, extname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

type SoundEvent =
  | "sessionStart"
  | "sessionCreated"
  | "promptSubmit"
  | "notification"
  | "permission"
  | "stop"

interface SfxConfig {
  enabled: boolean
  playerCommand: string | null
  playerArgs: string[]
  events: Record<SoundEvent, boolean>
  soundRoot: string
  eventFolders: Partial<Record<SoundEvent, string>>
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
const CONFIG_DIR = join(homedir(), ".config", "opencode")
const CONFIG_PATH = join(CONFIG_DIR, "opencode-sfx.json")
const DEFAULT_SOUND_ROOT = join(CONFIG_DIR, "opencode-sfx", "sounds")
const SOUND_EVENTS: SoundEvent[] = [
  "sessionStart",
  "sessionCreated",
  "promptSubmit",
  "notification",
  "permission",
  "stop",
]
const SUPPORTED_AUDIO_EXTENSIONS = new Set([".ogg", ".wav", ".mp3"])
const BUNDLED_ASSETS_ROOT = fileURLToPath(new URL("../assets", import.meta.url))

const DEFAULT_EVENTS: Record<SoundEvent, boolean> = {
  sessionStart: true,
  sessionCreated: true,
  promptSubmit: true,
  notification: true,
  permission: true,
  stop: true,
}

const DEFAULT_CONFIG: SfxConfig = {
  enabled: true,
  playerCommand: null,
  playerArgs: [],
  events: { ...DEFAULT_EVENTS },
  soundRoot: DEFAULT_SOUND_ROOT,
  eventFolders: {},
}

function defaultConfig(): SfxConfig {
  return {
    ...DEFAULT_CONFIG,
    playerArgs: [],
    events: { ...DEFAULT_EVENTS },
    eventFolders: {},
  }
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

function normalizeConfiguredFolder(
  soundRoot: string,
  folderValue: string
): string {
  if (isAbsolute(folderValue)) {
    return folderValue
  }

  return resolve(soundRoot, folderValue)
}

function loadConfig(): LoadConfigResult {
  if (!existsSync(CONFIG_PATH)) {
    return {
      config: defaultConfig(),
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
    const rawEventFolders = isObject(parsed.eventFolders)
      ? parsed.eventFolders
      : {}
    const configuredSoundRoot = optionalString(parsed.soundRoot)

    const config: SfxConfig = {
      enabled:
        typeof parsed.enabled === "boolean"
          ? parsed.enabled
          : DEFAULT_CONFIG.enabled,
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
        sessionCreated:
          typeof rawEvents.sessionCreated === "boolean"
            ? rawEvents.sessionCreated
            : DEFAULT_EVENTS.sessionCreated,
        promptSubmit:
          typeof rawEvents.promptSubmit === "boolean"
            ? rawEvents.promptSubmit
            : DEFAULT_EVENTS.promptSubmit,
        notification:
          typeof rawEvents.notification === "boolean"
            ? rawEvents.notification
            : DEFAULT_EVENTS.notification,
        permission:
          typeof rawEvents.permission === "boolean"
            ? rawEvents.permission
            : DEFAULT_EVENTS.permission,
        stop:
          typeof rawEvents.stop === "boolean"
            ? rawEvents.stop
            : DEFAULT_EVENTS.stop,
      },
      soundRoot: configuredSoundRoot
        ? normalizeConfiguredPath(configuredSoundRoot)
        : DEFAULT_CONFIG.soundRoot,
      eventFolders: {
        sessionStart: optionalString(rawEventFolders.sessionStart),
        sessionCreated: optionalString(rawEventFolders.sessionCreated),
        promptSubmit: optionalString(rawEventFolders.promptSubmit),
        notification: optionalString(rawEventFolders.notification),
        permission: optionalString(rawEventFolders.permission),
        stop: optionalString(rawEventFolders.stop),
      },
    }

    for (const eventName of SOUND_EVENTS) {
      const configuredFolder = config.eventFolders[eventName]
      if (configuredFolder) {
        config.eventFolders[eventName] = normalizeConfiguredFolder(
          config.soundRoot,
          configuredFolder
        )
      }
    }

    return { config, warnings: [] }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error"
    return {
      config: defaultConfig(),
      warnings: [`Failed to parse ${CONFIG_PATH}: ${message}`],
    }
  }
}

function resolveEventFolders(config: SfxConfig): Record<SoundEvent, string> {
  return {
    sessionStart:
      config.eventFolders.sessionStart ?? join(config.soundRoot, "sessionStart"),
    sessionCreated:
      config.eventFolders.sessionCreated ??
      join(config.soundRoot, "sessionCreated"),
    promptSubmit:
      config.eventFolders.promptSubmit ?? join(config.soundRoot, "promptSubmit"),
    notification:
      config.eventFolders.notification ?? join(config.soundRoot, "notification"),
    permission:
      config.eventFolders.permission ?? join(config.soundRoot, "permission"),
    stop: config.eventFolders.stop ?? join(config.soundRoot, "stop"),
  }
}

function ensureDirectory(pathValue: string, label: string): string | null {
  if (existsSync(pathValue)) {
    try {
      if (statSync(pathValue).isDirectory()) {
        return null
      }
      return `${label} exists but is not a directory: ${pathValue}`
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error"
      return `Failed to inspect ${label.toLowerCase()} at ${pathValue}: ${message}`
    }
  }

  try {
    mkdirSync(pathValue, { recursive: true })
    return null
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error"
    return `Failed to create ${label.toLowerCase()} at ${pathValue}: ${message}`
  }
}

function bootstrapSoundFolders(
  soundRoot: string,
  eventFolders: Record<SoundEvent, string>
): string[] {
  const warnings: string[] = []
  const rootExistsAtStartup = existsSync(soundRoot)

  const rootWarning = ensureDirectory(soundRoot, "sound root")
  if (rootWarning) {
    warnings.push(rootWarning)
  }

  for (const eventName of SOUND_EVENTS) {
    const folderWarning = ensureDirectory(
      eventFolders[eventName],
      `sound folder for "${eventName}"`
    )

    if (folderWarning) {
      warnings.push(folderWarning)
    }
  }

  if (!rootExistsAtStartup && !rootWarning) {
    warnings.push(...seedBundledAssetsTree(soundRoot))
  }

  return warnings
}

function seedBundledAssetsTree(soundRoot: string): string[] {
  const warnings: string[] = []

  if (resolve(soundRoot) === resolve(BUNDLED_ASSETS_ROOT)) {
    return warnings
  }

  if (!existsSync(BUNDLED_ASSETS_ROOT)) {
    warnings.push(`Bundled assets root not found: ${BUNDLED_ASSETS_ROOT}`)
    return warnings
  }

  try {
    if (!statSync(BUNDLED_ASSETS_ROOT).isDirectory()) {
      warnings.push(`Bundled assets root is not a directory: ${BUNDLED_ASSETS_ROOT}`)
      return warnings
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error"
    warnings.push(`Failed to inspect bundled assets root ${BUNDLED_ASSETS_ROOT}: ${message}`)
    return warnings
  }

  copyDirectoryTree(BUNDLED_ASSETS_ROOT, soundRoot, warnings)
  return warnings
}

function copyDirectoryTree(
  sourceDir: string,
  destinationDir: string,
  warnings: string[]
): void {
  let entries: Dirent<string>[]

  try {
    entries = readdirSync(sourceDir, { withFileTypes: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error"
    warnings.push(`Failed to read bundled assets directory ${sourceDir}: ${message}`)
    return
  }

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name)
    const destinationPath = join(destinationDir, entry.name)

    if (entry.isDirectory()) {
      const directoryWarning = ensureDirectory(
        destinationPath,
        `destination directory "${destinationPath}"`
      )

      if (directoryWarning) {
        warnings.push(directoryWarning)
        continue
      }

      copyDirectoryTree(sourcePath, destinationPath, warnings)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    if (existsSync(destinationPath)) {
      continue
    }

    try {
      copyFileSync(sourcePath, destinationPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error"
      warnings.push(
        `Failed to copy bundled file ${sourcePath} to ${destinationPath}: ${message}`
      )
    }
  }
}

function readSoundFolder(folderPath: string): string[] {
  let entries: Dirent<string>[]

  try {
    entries = readdirSync(folderPath, { withFileTypes: true })
  } catch {
    return []
  }

  const soundFiles: string[] = []

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) {
      continue
    }

    if (!SUPPORTED_AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      continue
    }

    soundFiles.push(join(folderPath, entry.name))
  }

  soundFiles.sort((left, right) => left.localeCompare(right))
  return soundFiles
}

function resolveEventSoundSets(
  eventFolders: Record<SoundEvent, string>
): Record<SoundEvent, string[]> {
  return {
    sessionStart: readSoundFolder(eventFolders.sessionStart),
    sessionCreated: readSoundFolder(eventFolders.sessionCreated),
    promptSubmit: readSoundFolder(eventFolders.promptSubmit),
    notification: readSoundFolder(eventFolders.notification),
    permission: readSoundFolder(eventFolders.permission),
    stop: readSoundFolder(eventFolders.stop),
  }
}

function pickSoundPath(
  eventName: SoundEvent,
  soundSets: Record<SoundEvent, string[]>,
  lastPlayedIndices: Partial<Record<SoundEvent, number>>
): string | null {
  const candidates = soundSets[eventName]

  if (candidates.length === 0) {
    return null
  }

  if (candidates.length === 1) {
    lastPlayedIndices[eventName] = 0
    return candidates[0]
  }

  const previousIndex = lastPlayedIndices[eventName]
  let nextIndex = Math.floor(Math.random() * candidates.length)

  if (previousIndex !== undefined && nextIndex === previousIndex) {
    nextIndex =
      (nextIndex + 1 + Math.floor(Math.random() * (candidates.length - 1))) %
      candidates.length
  }

  lastPlayedIndices[eventName] = nextIndex
  return candidates[nextIndex]
}

function removeMissingSoundPath(
  eventName: SoundEvent,
  pathValue: string,
  soundSets: Record<SoundEvent, string[]>,
  lastPlayedIndices: Partial<Record<SoundEvent, number>>
): void {
  soundSets[eventName] = soundSets[eventName].filter(
    (candidate) => candidate !== pathValue
  )
  delete lastPlayedIndices[eventName]
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
  const eventFolders = resolveEventFolders(config)
  const directoryWarnings = bootstrapSoundFolders(config.soundRoot, eventFolders)
  const soundSets = resolveEventSoundSets(eventFolders)
  const { player, warning } = resolvePlayer(config)
  const missingSoundWarnings = new Set<SoundEvent>()
  const activeSessions = new Set<string>()
  const lastPlayedIndices: Partial<Record<SoundEvent, number>> = {}

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

  for (const entry of [...warnings, ...directoryWarnings]) {
    await log("warn", entry)
  }

  if (warning) {
    await log("warn", warning)
  }

  const play = (eventName: SoundEvent) => {
    if (!config.enabled || !config.events[eventName] || !player) {
      return
    }

    let soundPath = pickSoundPath(eventName, soundSets, lastPlayedIndices)

    while (soundPath && !existsSync(soundPath)) {
      removeMissingSoundPath(eventName, soundPath, soundSets, lastPlayedIndices)
      soundPath = pickSoundPath(eventName, soundSets, lastPlayedIndices)
    }

    if (!soundPath) {
      if (missingSoundWarnings.has(eventName)) {
        return
      }

      missingSoundWarnings.add(eventName)
      void log(
        "warn",
        `No supported sound files found for \"${eventName}\" in ${eventFolders[eventName]}. Add .ogg, .wav, or .mp3 files.`
      )
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

      if (event.type === "session.created") {
        play("sessionCreated")
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
        return
      }

      if (event.type === "permission.updated") {
        play("permission")
      }
    },
    "permission.ask": async () => {
      play("permission")
    },
  }
}

export default WarcraftSfxPlugin
