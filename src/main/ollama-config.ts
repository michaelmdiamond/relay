import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { writePrivateJson } from './private-json'

const CONFIG_PATH = path.join(app.getPath('userData'), 'ollama-config.json')

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

interface OllamaConfig {
  baseUrl: string
  model: string
}

function readConfig(): OllamaConfig | null {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } catch { return null }
}

function writeConfig(cfg: OllamaConfig): void {
  writePrivateJson(CONFIG_PATH, cfg)
}

export function getOllamaConfig(): OllamaConfig | null {
  return readConfig()
}

export function isOllamaConfigured(): boolean {
  const cfg = readConfig()
  return !!(cfg?.model)
}

export function saveOllamaConfig(baseUrl: string, model: string): void {
  writeConfig({ baseUrl: baseUrl || DEFAULT_OLLAMA_URL, model })
}

export function disconnectOllama(): void {
  try { fs.unlinkSync(CONFIG_PATH) } catch { /* already gone */ }
}
