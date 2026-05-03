import { spawn, exec, execSync, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as http from 'http'
import { getOllamaConfig, DEFAULT_OLLAMA_URL } from './ollama-config'

const BINARY_CANDIDATES = [
  '/usr/local/bin/ollama',
  '/opt/homebrew/bin/ollama',
  '/usr/bin/ollama',
  `${process.env.HOME ?? ''}/bin/ollama`,
  // macOS .app bundle ships the CLI here
  '/Applications/Ollama.app/Contents/Resources/ollama',
]

const BROAD_PATH = `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${process.env.PATH ?? ''}`

let managedProcess: ChildProcess | null = null

function findOllamaBinary(): string | null {
  const known = BINARY_CANDIDATES.find(p => fs.existsSync(p))
  if (known) return known

  // Last resort: ask the shell with a broad PATH
  try {
    const result = execSync('which ollama', { env: { ...process.env, PATH: BROAD_PATH } })
      .toString().trim()
    if (result && fs.existsSync(result)) return result
  } catch { /* not found */ }

  return null
}

// macOS Sequoia resolves 'localhost' to ::1 (IPv6) but Ollama binds to 127.0.0.1 (IPv4).
// Force IPv4 to avoid the mismatch.
function toIPv4(baseUrl: string): string {
  return baseUrl.replace(/localhost/, '127.0.0.1')
}

function ping(baseUrl: string): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const url = new URL('/api/tags', toIPv4(baseUrl))
      const req = http.get(
        { hostname: url.hostname, port: Number(url.port) || 11434, path: url.pathname, timeout: 3000 },
        res => { res.resume(); resolve((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300) }
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => { req.destroy(); resolve(false) })
    } catch {
      resolve(false)
    }
  })
}

function spawnBinary(bin: string): void {
  if (managedProcess) return
  managedProcess = spawn(bin, ['serve'], {
    stdio: 'ignore',
    detached: false,
    env: { ...process.env, PATH: BROAD_PATH },
  })
  managedProcess.on('exit', () => { managedProcess = null })
}

function openOllamaApp(): void {
  exec('open -a Ollama')
}

async function waitUntilReachable(baseUrl: string, maxMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    if (await ping(baseUrl)) return true
    await new Promise(r => setTimeout(r, 600))
  }
  return false
}

export async function checkOllamaReachable(): Promise<boolean> {
  const baseUrl = getOllamaConfig()?.baseUrl ?? DEFAULT_OLLAMA_URL
  return ping(baseUrl)
}

export async function ensureOllamaRunning(): Promise<void> {
  const baseUrl = getOllamaConfig()?.baseUrl ?? DEFAULT_OLLAMA_URL
  if (await ping(baseUrl)) return

  const bin = findOllamaBinary()
  if (bin) {
    spawnBinary(bin)
  } else {
    openOllamaApp()
  }
}

export async function startAndGetModels(baseUrl = DEFAULT_OLLAMA_URL): Promise<{ models: string[]; error?: string }> {
  // Already up — skip straight to listing
  if (!(await ping(baseUrl))) {
    const bin = findOllamaBinary()
    if (bin) {
      spawnBinary(bin)
    } else {
      // Try the macOS app as a fallback
      openOllamaApp()
    }
  }

  if (!(await waitUntilReachable(baseUrl))) {
    const bin = findOllamaBinary()
    const hint = bin
      ? `Binary found at ${bin} but did not respond.`
      : 'Could not find ollama binary in common paths.'
    return { models: [], error: `Ollama did not start in time. ${hint}\nMake sure Ollama is installed from ollama.com, then try again.` }
  }

  try {
    const res = await fetch(`${toIPv4(baseUrl)}/api/tags`, { signal: AbortSignal.timeout(5000) })
    const json = await res.json() as { models?: Array<{ name: string }> }
    const models = (json.models ?? []).map(m => m.name)
    if (models.length === 0) return { models: [], error: 'No models installed yet.\nRun in Terminal: ollama pull llama3.2' }
    return { models }
  } catch (err) {
    return { models: [], error: `Failed to list models: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export function stopOllamaProcess(): void {
  if (managedProcess) {
    managedProcess.kill('SIGTERM')
    managedProcess = null
  }
}
