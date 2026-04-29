import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

const CONFIG_PATH = path.join(app.getPath('userData'), 'gemini-config.json')

interface GeminiConfig {
  apiKey: string
}

function readConfig(): GeminiConfig | null {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } catch { return null }
}

function writeConfig(cfg: GeminiConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 })
}

function clearConfig(): void {
  try { fs.unlinkSync(CONFIG_PATH) } catch { /* ignore */ }
}

export function isGeminiConnected(): { connected: boolean } {
  const cfg = readConfig()
  return { connected: !!(cfg?.apiKey) }
}

export function saveGeminiKey(apiKey: string): void {
  writeConfig({ apiKey })
}

export function getGeminiApiKey(): string | null {
  return readConfig()?.apiKey ?? null
}

export function disconnectGemini(): void {
  clearConfig()
}
