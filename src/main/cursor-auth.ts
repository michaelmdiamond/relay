import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { writePrivateJson } from './private-json'

const CONFIG_PATH = path.join(app.getPath('userData'), 'cursor-config.json')

interface CursorConfig {
  apiKey: string
  userEmail?: string
  apiKeyName?: string
  model?: string
}

const DEFAULT_CURSOR_MODEL = 'composer-2'
const LEGACY_DEFAULT_CURSOR_MODEL = 'composer-2'

function readConfig(): CursorConfig | null {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } catch { return null }
}

function writeConfig(cfg: CursorConfig): void {
  writePrivateJson(CONFIG_PATH, cfg)
}

export function getCursorApiKey(): string | null {
  return readConfig()?.apiKey ?? process.env.CURSOR_API_KEY ?? null
}

export function isCursorConnected(): { configured: boolean; userEmail?: string; apiKeyName?: string } {
  const cfg = readConfig()
  return {
    configured: !!(cfg?.apiKey || process.env.CURSOR_API_KEY),
    userEmail: cfg?.userEmail,
    apiKeyName: cfg?.apiKeyName,
  }
}

export function saveCursorKey(apiKey: string): void {
  const existing = readConfig()
  const existingModel = existing?.model === 'auto' ? DEFAULT_CURSOR_MODEL : existing?.model
  writeConfig({ ...existing, apiKey, model: existingModel ?? DEFAULT_CURSOR_MODEL })
}

export function saveCursorKeyMetadata(metadata: { userEmail?: string; apiKeyName?: string }): void {
  const existing = readConfig()
  if (!existing?.apiKey) return
  writeConfig({ ...existing, ...metadata })
}

export function disconnectCursor(): void {
  try { fs.unlinkSync(CONFIG_PATH) } catch { /* already gone */ }
}

export function getCursorModel(): string {
  const model = readConfig()?.model
  return !model || model === 'auto' ? DEFAULT_CURSOR_MODEL : model
}

export function saveCursorModel(model: string): void {
  const existing = readConfig()
  if (!existing?.apiKey) return
  writeConfig({ ...existing, model })
}
