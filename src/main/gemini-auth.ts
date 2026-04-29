import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { GeminiModel } from '../shared/types'

const CONFIG_PATH = path.join(app.getPath('userData'), 'gemini-config.json')

const DEFAULT_MODEL: GeminiModel = 'gemini-2.0-flash'

interface GeminiConfig {
  apiKey: string
  model?: GeminiModel
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
  const existing = readConfig()
  writeConfig({ model: existing?.model ?? DEFAULT_MODEL, apiKey })
}

export function getGeminiApiKey(): string | null {
  return readConfig()?.apiKey ?? null
}

export function getGeminiModel(): GeminiModel {
  return readConfig()?.model ?? DEFAULT_MODEL
}

export function saveGeminiModel(model: GeminiModel): void {
  const existing = readConfig()
  if (!existing?.apiKey) return
  writeConfig({ ...existing, model })
}

export function disconnectGemini(): void {
  clearConfig()
}
