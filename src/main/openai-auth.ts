import { app, shell } from 'electron'
import * as http from 'http'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import type { OpenAICredentials } from '../shared/types'
import { writePrivateJson } from './private-json'

// ── Constants ─────────────────────────────────────────────────────────────────

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const REDIRECT_URI = 'http://localhost:1455/auth/callback'
const AUTH_URL = 'https://auth.openai.com/oauth/authorize'
const TOKEN_URL = 'https://auth.openai.com/oauth/token'
const CALLBACK_PORT = 1455
const CREDENTIALS_PATH = path.join(app.getPath('userData'), 'openai-credentials.json')
const TOKEN_BUFFER_MS = 5 * 60 * 1000

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

function generateState(): string {
  return crypto.randomBytes(16).toString('hex')
}

// ── Credential storage ────────────────────────────────────────────────────────

export function readCredentials(): OpenAICredentials | null {
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'))
  } catch {
    return null
  }
}

function writeCredentials(creds: OpenAICredentials): void {
  writePrivateJson(CREDENTIALS_PATH, creds)
}

export function clearCredentials(): void {
  try { fs.unlinkSync(CREDENTIALS_PATH) } catch { /* already gone */ }
}

export function isOpenAIConnected(): { connected: boolean; email?: string } {
  const creds = readCredentials()
  if (!creds) return { connected: false }
  return { connected: true, email: creds.email }
}

// ── JWT decode (no verification — we trust auth.openai.com TLS) ───────────────

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return {}
  }
}

function extractFromIdToken(idToken: string): { email?: string; accountId?: string } {
  const claims = decodeJwtPayload(idToken) as Record<string, unknown> & {
    email?: string
    chatgpt_account_id?: string
    'https://api.openai.com/auth'?: { chatgpt_account_id?: string }
    organizations?: Array<{ id: string }>
  }
  const accountId =
    claims.chatgpt_account_id ??
    (claims['https://api.openai.com/auth'] as { chatgpt_account_id?: string } | undefined)?.chatgpt_account_id ??
    claims.organizations?.[0]?.id
  return { email: claims.email, accountId }
}

// ── Token exchange ─────────────────────────────────────────────────────────────

async function exchangeCode(code: string, verifier: string): Promise<OpenAICredentials> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
    // NOTE: do NOT include state — OpenAI rejects the request if state is in the body
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed (${res.status}): ${text}`)
  }

  const json = await res.json() as {
    access_token: string
    refresh_token: string
    id_token?: string
    expires_in: number
  }

  const { email, accountId } = json.id_token ? extractFromIdToken(json.id_token) : {}

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    email,
    accountId,
  }
}

export async function refreshCredentials(creds: OpenAICredentials): Promise<OpenAICredentials> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: creds.refreshToken,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    // Refresh token expired/revoked — clear stored creds so user re-auths
    clearCredentials()
    const text = await res.text()
    throw new Error(`Token refresh failed (${res.status}): ${text}`)
  }

  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    id_token?: string
    expires_in: number
  }

  const refreshed: OpenAICredentials = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? creds.refreshToken,
    expiresAt: Date.now() + json.expires_in * 1000,
    email: creds.email,
    accountId: creds.accountId,
  }

  if (json.id_token) {
    const { email, accountId } = extractFromIdToken(json.id_token)
    if (email) refreshed.email = email
    if (accountId) refreshed.accountId = accountId
  }

  writeCredentials(refreshed)
  return refreshed
}

export function isTokenExpired(creds: OpenAICredentials): boolean {
  return Date.now() >= creds.expiresAt - TOKEN_BUFFER_MS
}

// Returns a valid (possibly refreshed) access token, or throws.
export async function getValidAccessToken(): Promise<{ accessToken: string; accountId?: string }> {
  let creds = readCredentials()
  if (!creds) throw new Error('Not authenticated with OpenAI. Please sign in.')
  if (isTokenExpired(creds)) {
    creds = await refreshCredentials(creds)
  }
  return { accessToken: creds.accessToken, accountId: creds.accountId }
}

// ── OAuth login flow ──────────────────────────────────────────────────────────

export function startLogin(): Promise<void> {
  return new Promise((resolve, reject) => {
    const verifier = generateCodeVerifier()
    const challenge = generateCodeChallenge(verifier)
    const state = generateState()

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'openid profile email offline_access',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      response_type: 'code',
      state,
      codex_cli_simplified_flow: 'true',
      originator: 'relay',
    })

    const authUrl = `${AUTH_URL}?${params.toString()}`

    // Spin up local callback server
    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith('/auth/callback')) {
        res.writeHead(404).end()
        return
      }

      const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`)
      const returnedState = url.searchParams.get('state')
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(callbackHtml('Login cancelled', false))
        server.close()
        reject(new Error(`OAuth error: ${error}`))
        return
      }

      if (returnedState !== state || !code) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(callbackHtml('Invalid response', false))
        server.close()
        reject(new Error('Invalid OAuth state or missing code'))
        return
      }

      try {
        const creds = await exchangeCode(code, verifier)
        writeCredentials(creds)
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(callbackHtml('Connected! You can close this tab.', true))
        server.close()
        resolve()
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' }).end(callbackHtml('Authentication failed', false))
        server.close()
        reject(err)
      }
    })

    // Timeout after 5 minutes
    const timeout = setTimeout(() => {
      server.close()
      reject(new Error('Login timed out'))
    }, 5 * 60 * 1000)

    server.on('close', () => clearTimeout(timeout))

    server.listen(CALLBACK_PORT, () => {
      shell.openExternal(authUrl)
    })

    server.on('error', (err) => {
      reject(new Error(`Could not start callback server: ${err.message}`))
    })
  })
}

function callbackHtml(message: string, success: boolean): string {
  const color = success ? '#4ade80' : '#f87171'
  return `<!DOCTYPE html><html><head><title>Relay</title>
<style>body{background:#111;color:#eee;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style>
</head><body><h2 style="color:${color}">${message}</h2></body></html>`
}
