import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { UsageLimitSettings } from '../shared/types'

const LIMITS_PATH = path.join(app.getPath('userData'), 'usage-limits.json')

const DEFAULT_LIMITS: UsageLimitSettings = {
  overallMonthlyTokens: undefined,
  anthropicMonthlyTokens: undefined,
  openaiMonthlyTokens: undefined,
  googleMonthlyTokens: undefined,
  ollamaMonthlyTokens: undefined,
}

function sanitizeLimit(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const normalized = Math.floor(value)
  return normalized > 0 ? normalized : undefined
}

function normalizeLimits(limits?: UsageLimitSettings): UsageLimitSettings {
  return {
    overallMonthlyTokens: sanitizeLimit(limits?.overallMonthlyTokens),
    anthropicMonthlyTokens: sanitizeLimit(limits?.anthropicMonthlyTokens),
    openaiMonthlyTokens: sanitizeLimit(limits?.openaiMonthlyTokens),
    googleMonthlyTokens: sanitizeLimit(limits?.googleMonthlyTokens),
    ollamaMonthlyTokens: sanitizeLimit(limits?.ollamaMonthlyTokens),
  }
}

export function getUsageLimits(): UsageLimitSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(LIMITS_PATH, 'utf8')) as UsageLimitSettings
    return { ...DEFAULT_LIMITS, ...normalizeLimits(raw) }
  } catch {
    return { ...DEFAULT_LIMITS }
  }
}

export function saveUsageLimits(limits: UsageLimitSettings): UsageLimitSettings {
  const normalized = normalizeLimits(limits)
  fs.writeFileSync(LIMITS_PATH, JSON.stringify(normalized, null, 2))
  return normalized
}
