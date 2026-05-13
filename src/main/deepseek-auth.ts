import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { writePrivateJson } from './private-json'
import type { DeepSeekModel } from '../shared/types'

const CONFIG_PATH = path.join(app.getPath('userData'), 'deepseek-config.json')
const DEFAULT_MODEL: DeepSeekModel = 'deepseek-v4-flash'

interface DeepSeekConfig {
  apiKey: string
  model?: DeepSeekModel
}

function readConfig(): DeepSeekConfig | null {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } catch { return null }
}

function writeConfig(cfg: DeepSeekConfig): void {
  writePrivateJson(CONFIG_PATH, cfg)
}

function clearConfig(): void {
  try { fs.unlinkSync(CONFIG_PATH) } catch { /* ignore */ }
}

export function isDeepSeekConnected(): { configured: boolean } {
  const cfg = readConfig()
  return { configured: !!cfg?.apiKey }
}

export function saveDeepSeekKey(apiKey: string): void {
  writeConfig({ apiKey, model: readConfig()?.model ?? DEFAULT_MODEL })
}

export function getDeepSeekApiKey(): string | null {
  return readConfig()?.apiKey ?? null
}

export function getDeepSeekModel(): DeepSeekModel {
  return readConfig()?.model ?? DEFAULT_MODEL
}

export function saveDeepSeekModel(model: DeepSeekModel): void {
  const cfg = readConfig()
  writeConfig({ apiKey: cfg?.apiKey ?? '', model })
}

export function disconnectDeepSeek(): void {
  clearConfig()
}
