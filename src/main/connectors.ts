import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { ConnectorEntry, ConnectorInventory, ConnectorProviderSnapshot } from '../shared/types'
import { isOpenAIConnected } from './openai-auth'
import { getGeminiModel, isGeminiConnected } from './gemini-auth'
import { isCursorConnected } from './cursor-auth'

const HOME = process.env.HOME ?? ''
const CLAUDE_STATE_PATH = path.join(HOME, '.claude.json')
const CLAUDE_PLUGIN_DIR = path.join(HOME, '.claude', 'plugins', 'marketplaces', 'claude-plugins-official', 'external_plugins')
const CODEX_CONFIG_PATH = path.join(HOME, '.codex', 'config.toml')

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

function titleize(value: string): string {
  return value
    .replace(/^claude\.ai\s+/i, '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function makeEntry(id: string, name: string, status: ConnectorEntry['status'], detail?: string): ConnectorEntry {
  return { id, name, status, detail }
}

function readClaudeSnapshot(): ConnectorProviderSnapshot {
  const state = readJsonFile<{ claudeAiMcpEverConnected?: string[] }>(CLAUDE_STATE_PATH)
  const connectedApps = Array.from(new Set(state?.claudeAiMcpEverConnected ?? []))
  const connectedItems = connectedApps.map((name) =>
    makeEntry(`claude:${name}`, titleize(name), 'connected', 'Previously connected in Claude')
  )

  const installedItems: ConnectorEntry[] = []
  const connectedNames = new Set(connectedItems.map(item => item.name.toLowerCase()))

  try {
    const dirs = fs.readdirSync(CLAUDE_PLUGIN_DIR, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b))

    for (const dir of dirs) {
      const displayName = titleize(dir)
      if (connectedNames.has(displayName.toLowerCase())) continue
      installedItems.push(
        makeEntry(`claude-plugin:${dir}`, displayName, 'installed', 'Installed locally for Claude')
      )
    }
  } catch {
    // Ignore missing plugin directory.
  }

  const items = [...connectedItems, ...installedItems]

  return {
    provider: 'claude',
    label: 'Claude',
    subtitle: connectedItems.length > 0
      ? 'Claude.ai apps and local Claude plugins'
      : 'No active Claude app connectors detected',
    items,
  }
}

function readEnabledCodexPlugins(): ConnectorEntry[] {
  try {
    const content = fs.readFileSync(CODEX_CONFIG_PATH, 'utf8')
    const matches = [...content.matchAll(/\[plugins\."([^"]+)"\]\s+enabled\s*=\s*true/gm)]
    return matches.map((match) => {
      const pluginId = match[1]
      const [name] = pluginId.split('@')
      return makeEntry(
        `codex-plugin:${pluginId}`,
        titleize(name),
        'configured',
        'Enabled in Codex'
      )
    })
  } catch {
    return []
  }
}

function readCodexSnapshot(): ConnectorProviderSnapshot {
  const auth = isOpenAIConnected()
  const items: ConnectorEntry[] = []

  if (auth.connected) {
    items.push(
      makeEntry(
        'codex:openai-account',
        'OpenAI account',
        'connected',
        auth.email ?? 'Authenticated for Codex'
      )
    )
  }

  items.push(...readEnabledCodexPlugins())

  return {
    provider: 'codex',
    label: 'Codex',
    subtitle: auth.connected
      ? 'OpenAI login and enabled Codex plugins'
      : 'Codex plugins and local account status',
    items,
  }
}

function readGeminiSnapshot(): ConnectorProviderSnapshot {
  const auth = isGeminiConnected()
  const items: ConnectorEntry[] = []

  if (auth.configured) {
    items.push(
      makeEntry(
        'gemini:api-key',
        'Gemini API key',
        'configured',
        `Model: ${getGeminiModel()}`
      )
    )
  }

  return {
    provider: 'gemini',
    label: 'Gemini',
    subtitle: auth.configured
      ? 'Direct API configuration in Relay'
      : 'No Gemini connection detected',
    items,
  }
}

function readCursorSnapshot(): ConnectorProviderSnapshot {
  const auth = isCursorConnected()
  const items: ConnectorEntry[] = []

  if (auth.configured) {
    items.push(
      makeEntry(
        'cursor:api-key',
        'Cursor API key',
        'configured',
        auth.userEmail ?? auth.apiKeyName ?? 'Configured for Cursor SDK'
      )
    )
  }

  return {
    provider: 'cursor',
    label: 'Cursor',
    subtitle: auth.configured
      ? 'Cursor SDK local agents'
      : 'No Cursor SDK key configured',
    items,
  }
}

export function getConnectorInventory(): ConnectorInventory {
  return {
    providers: [
      readClaudeSnapshot(),
      readCodexSnapshot(),
      readGeminiSnapshot(),
      readCursorSnapshot(),
    ],
    scannedAt: new Date().toISOString(),
  }
}
