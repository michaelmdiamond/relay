import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type {
  AutomationCatalogItem,
  AutomationCatalogSnapshot,
  AutomationProviderSummary,
} from '../shared/types'
import { getAgentProfiles, getWorkflowDefinitions } from './workflows'

interface CodexAutomationRecord {
  id: string
  name?: string
  prompt?: string
  status?: string
  rrule?: string
  destination?: string
  model?: string
}

function readText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

function readJson(filePath: string): Record<string, unknown> | null {
  const contents = readText(filePath)
  if (!contents) return null
  try {
    return JSON.parse(contents) as Record<string, unknown>
  } catch {
    return null
  }
}

function parseTomlScalar(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseCodexAutomation(filePath: string, id: string): CodexAutomationRecord | null {
  const contents = readText(filePath)
  if (!contents) return null

  const record: CodexAutomationRecord = { id }
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('[')) continue
    const separator = line.indexOf('=')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    const value = parseTomlScalar(line.slice(separator + 1))
    if (key === 'name') record.name = value
    if (key === 'prompt') record.prompt = value
    if (key === 'status') record.status = value
    if (key === 'rrule') record.rrule = value
    if (key === 'destination') record.destination = value
    if (key === 'model') record.model = value
  }
  return record
}

function summarizeRrule(rrule?: string): string | undefined {
  if (!rrule) return undefined
  if (rrule.includes('FREQ=HOURLY')) return 'Hourly'
  if (rrule.includes('FREQ=DAILY')) return 'Daily'
  if (rrule.includes('FREQ=WEEKLY')) return 'Weekly'
  if (rrule.includes('FREQ=MINUTELY')) return 'Frequent'
  return 'Scheduled'
}

function codexAutomationItems(): AutomationCatalogItem[] {
  const automationsRoot = path.join(app.getPath('home'), '.codex', 'automations')
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(automationsRoot, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .flatMap((entry): AutomationCatalogItem[] => {
      const record = parseCodexAutomation(
        path.join(automationsRoot, entry.name, 'automation.toml'),
        entry.name,
      )
      if (!record) return []
      return [{
        id: `codex:${record.id}`,
        source: 'codex',
        kind: 'scheduled-task',
        title: record.name || 'Codex automation',
        description: record.prompt || 'Scheduled Codex automation',
        status: record.status?.toUpperCase() === 'PAUSED' ? 'paused' : 'active',
        cadence: summarizeRrule(record.rrule),
        destination: record.destination,
        model: record.model,
        external: true,
      }]
    })
}

function hasCodexAutomationStore(): boolean {
  try {
    return fs.statSync(path.join(app.getPath('home'), '.codex', 'automations')).isDirectory()
  } catch {
    return false
  }
}

function relayCatalogItems(): AutomationCatalogItem[] {
  const agents = getAgentProfiles().map((profile) => ({
    id: `relay-agent:${profile.id}`,
    source: 'relay' as const,
    kind: 'agent' as const,
    title: profile.name,
    description: `${profile.role} profile for ${profile.provider}`,
    status: profile.enabled ? 'available' as const : 'paused' as const,
    model: profile.model,
  }))

  const workflows = getWorkflowDefinitions().map((workflow) => ({
    id: `relay-workflow:${workflow.id}`,
    source: 'relay' as const,
    kind: 'workflow' as const,
    title: workflow.name,
    description: workflow.description,
    status: 'available' as const,
    cadence: 'Manual',
  }))

  return [...agents, ...workflows]
}

function claudeProviderSummary(): AutomationProviderSummary {
  const configPath = path.join(
    app.getPath('home'),
    'Library',
    'Application Support',
    'Claude',
    'claude_desktop_config.json',
  )
  const config = readJson(configPath)
  const scheduledTasksEnabled = config?.coworkScheduledTasksEnabled === true

  return {
    source: 'claude',
    label: 'Claude Cowork',
    status: scheduledTasksEnabled ? 'detected' : 'unavailable',
    detail: scheduledTasksEnabled
      ? 'Scheduled-task support is enabled in Claude Desktop.'
      : 'No local Claude Cowork scheduling signal was found.',
    itemCount: 0,
  }
}

export function getAutomationCatalog(): AutomationCatalogSnapshot {
  const codexItems = codexAutomationItems()
  const codexStoreDetected = hasCodexAutomationStore()
  return {
    generatedAt: new Date().toISOString(),
    items: [...relayCatalogItems(), ...codexItems],
    providers: [
      {
        source: 'codex',
        label: 'Codex',
        status: codexItems.length > 0 ? 'connected' : codexStoreDetected ? 'detected' : 'unavailable',
        detail: codexItems.length > 0
          ? `${codexItems.length} local automation${codexItems.length === 1 ? '' : 's'} indexed.`
          : codexStoreDetected
            ? 'Codex automation storage is available, with no local entries detected.'
            : 'No local Codex automation storage was found.',
        itemCount: codexItems.length,
      },
      claudeProviderSummary(),
    ],
  }
}
