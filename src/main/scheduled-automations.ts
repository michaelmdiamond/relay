import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import * as schedule from 'node-schedule'
import type { ModelChoice, ScheduledAutomation, ScheduledAutomationInput } from '../shared/types'
import { newConversation, sendMessage } from './chat'

const STORE_PATH = path.join(app.getPath('userData'), 'scheduled-automations.json')

type EmitFn = (automations: ScheduledAutomation[]) => void
let emitAutomations: EmitFn | null = null
const jobs = new Map<string, schedule.Job>()

export function setAutomationEmitter(fn: EmitFn): void {
  emitAutomations = fn
}

function readStore(): ScheduledAutomation[] {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8')
    return JSON.parse(raw) as ScheduledAutomation[]
  } catch {
    return []
  }
}

function writeStore(automations: ScheduledAutomation[]): void {
  fs.writeFileSync(STORE_PATH, JSON.stringify(automations, null, 2), 'utf8')
}

export function getScheduledAutomations(): ScheduledAutomation[] {
  return readStore()
}

export function createScheduledAutomation(input: ScheduledAutomationInput): ScheduledAutomation {
  const automations = readStore()
  const automation: ScheduledAutomation = {
    id: randomUUID(),
    title: input.title,
    prompt: input.prompt,
    model: input.model,
    schedule: input.schedule,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    runCount: 0,
  }
  automations.push(automation)
  writeStore(automations)
  scheduleJob(automation)
  return automation
}

export function updateScheduledAutomation(id: string, input: Partial<ScheduledAutomationInput & { enabled: boolean }>): ScheduledAutomation | null {
  const automations = readStore()
  const idx = automations.findIndex((a) => a.id === id)
  if (idx === -1) return null
  const updated: ScheduledAutomation = {
    ...automations[idx],
    ...input,
    updatedAt: new Date().toISOString(),
  }
  automations[idx] = updated
  writeStore(automations)
  unscheduleJob(id)
  if (updated.enabled) scheduleJob(updated)
  return updated
}

export function deleteScheduledAutomation(id: string): boolean {
  const automations = readStore()
  const idx = automations.findIndex((a) => a.id === id)
  if (idx === -1) return false
  automations.splice(idx, 1)
  writeStore(automations)
  unscheduleJob(id)
  return true
}

export async function runAutomationNow(id: string): Promise<void> {
  const automations = readStore()
  const automation = automations.find((a) => a.id === id)
  if (!automation) throw new Error('Automation not found')
  await fireAutomation(automation)
}

function scheduleJob(automation: ScheduledAutomation): void {
  if (!automation.enabled) return
  try {
    const job = schedule.scheduleJob(automation.id, automation.schedule, async () => {
      await fireAutomation(automation)
    })
    if (job) {
      jobs.set(automation.id, job)
      patchNextRun(automation.id, job.nextInvocation()?.toISOString())
    }
  } catch {
    // invalid cron — leave unscheduled
  }
}

function unscheduleJob(id: string): void {
  const job = jobs.get(id)
  if (job) {
    job.cancel()
    jobs.delete(id)
  }
}

function patchNextRun(id: string, nextRunAt?: string): void {
  const automations = readStore()
  const idx = automations.findIndex((a) => a.id === id)
  if (idx === -1) return
  automations[idx] = { ...automations[idx], nextRunAt }
  writeStore(automations)
  emitAutomations?.(automations)
}

async function fireAutomation(automation: ScheduledAutomation): Promise<void> {
  const conversation = newConversation({ preserveEmptyProject: true })
  // Retitle the conversation to match the automation
  const conversationTitle = `[Auto] ${automation.title}`
  const automations = readStore()
  const idx = automations.findIndex((a) => a.id === automation.id)

  const now = new Date().toISOString()
  const runEntry = { conversationId: conversation.id, ranAt: now }
  const updatedRuns = [runEntry, ...(automations[idx]?.lastRuns ?? [])].slice(0, 20)

  if (idx !== -1) {
    automations[idx] = {
      ...automations[idx],
      lastRunAt: now,
      runCount: (automations[idx].runCount ?? 0) + 1,
      lastRuns: updatedRuns,
    }
    const job = jobs.get(automation.id)
    if (job) {
      automations[idx].nextRunAt = job.nextInvocation()?.toISOString()
    }
    writeStore(automations)
    emitAutomations?.(automations)
  }

  await sendMessage(
    conversation.id,
    automation.prompt,
    automation.model as ModelChoice,
    new AbortController().signal,
    {
      streamStart: () => {},
      chunk: () => {},
      done: () => {
        emitAutomations?.(readStore())
      },
      error: () => {},
      cancel: () => {},
    },
  )

  // Patch title after creation (conversations are created with generic titles)
  const all = readStore()
  const final = all.find((a) => a.id === automation.id)
  if (final) {
    void conversationTitle // title is available for future linking
  }
}

export function initAutomationScheduler(): void {
  const automations = readStore()
  for (const automation of automations) {
    if (automation.enabled) scheduleJob(automation)
  }
}

export function shutdownAutomationScheduler(): void {
  schedule.gracefulShutdown()
}
