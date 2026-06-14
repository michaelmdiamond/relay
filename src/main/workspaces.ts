import { app } from 'electron'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import { writePrivateJson } from './private-json'
import type { Conversation, TaskItem, Workspace } from '../shared/types'

const STORE_PATH = path.join(app.getPath('userData'), 'workspaces.json')
const GENERAL_WORKSPACE_ID = 'general'

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeWorkspace(raw: Partial<Workspace>): Workspace | null {
  const createdAt = normalizeString(raw.createdAt) ?? nowIso()
  const explicitKind = raw.kind === 'repo' || raw.kind === 'general' ? raw.kind : undefined
  const rawProjectPath = normalizeString(raw.projectPath)
  const repoRoot = rawProjectPath ? findGitRoot(rawProjectPath) : null
  const projectRoot = repoRoot ?? (rawProjectPath ? directoryForPath(rawProjectPath) : null)
  const kind = explicitKind ?? (projectRoot ? 'repo' : 'general')

  if (kind === 'repo' && !projectRoot) return null
  if (kind === 'general') {
    return {
      id: GENERAL_WORKSPACE_ID,
      name: 'General',
      kind,
      createdAt,
      updatedAt: normalizeString(raw.updatedAt) ?? createdAt,
    }
  }

  const root = projectRoot
  if (!root) return null
  return {
    id: normalizeString(raw.id) ?? randomUUID(),
    name: normalizeString(raw.name) ?? (path.basename(root) || root),
    kind,
    projectPath: root,
    createdAt,
    updatedAt: normalizeString(raw.updatedAt) ?? createdAt,
  }
}

function readStore(): Workspace[] {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as Partial<Workspace>[]
    return dedupeWorkspaces(raw.map(normalizeWorkspace).filter((workspace): workspace is Workspace => !!workspace))
  } catch {
    return []
  }
}

function writeStore(workspaces: Workspace[]): void {
  writePrivateJson(STORE_PATH, workspaces)
}

function sortWorkspaces(workspaces: Workspace[]): Workspace[] {
  return [...workspaces].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'general' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function dedupeWorkspaces(workspaces: Workspace[]): Workspace[] {
  const byKey = new Map<string, Workspace>()
  for (const workspace of workspaces) {
    const key = workspace.kind === 'general'
      ? GENERAL_WORKSPACE_ID
      : `repo:${workspace.projectPath}`
    if (!byKey.has(key)) byKey.set(key, workspace)
  }
  return sortWorkspaces(Array.from(byKey.values()))
}

function directoryForPath(candidatePath: string): string | null {
  try {
    const resolved = path.resolve(candidatePath)
    const stats = fs.statSync(resolved)
    return stats.isDirectory() ? resolved : path.dirname(resolved)
  } catch {
    return null
  }
}

function findGitRoot(candidatePath: string): string | null {
  let current = directoryForPath(candidatePath)
  while (current) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return hasGitHubRemote(current) ? current : null
    }
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
  return null
}

function hasGitHubRemote(repoRoot: string): boolean {
  try {
    const output = execFileSync('git', ['-C', repoRoot, 'remote', '-v'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
    return output.includes('github.com') || output.includes('github:')
  } catch {
    return false
  }
}

function repoRootsFromItems(conversations: Conversation[], tasks: TaskItem[]): Map<string, string> {
  const repos = new Map<string, string>()
  for (const item of [...conversations, ...tasks]) {
    const itemPath = normalizeString(item.projectPath)
    if (!itemPath) continue
    const repoRoot = findGitRoot(itemPath) ?? directoryForPath(itemPath)
    if (!repoRoot || repos.has(repoRoot)) continue
    repos.set(repoRoot, path.basename(repoRoot) || repoRoot)
  }
  return repos
}

function generalWorkspace(existing?: Workspace): Workspace {
  const createdAt = existing?.createdAt ?? nowIso()
  return {
    id: GENERAL_WORKSPACE_ID,
    name: 'General',
    kind: 'general',
    createdAt,
    updatedAt: existing?.updatedAt ?? createdAt,
  }
}

export function getWorkspaces(conversations: Conversation[] = [], tasks: TaskItem[] = []): Workspace[] {
  const stored = readStore()
  const general = generalWorkspace(stored.find((workspace) => workspace.kind === 'general'))
  const storedProjects = stored.filter((workspace) => workspace.kind === 'repo' && workspace.projectPath)
  const existingRepos = new Map(storedProjects.map((workspace) => [workspace.projectPath!, workspace]))
  const repoRoots = repoRootsFromItems(conversations, tasks)
  const repos = Array.from(repoRoots.entries()).map(([projectPath, name]) => (
    existingRepos.get(projectPath) ?? {
      id: randomUUID(),
      name,
      kind: 'repo' as const,
      projectPath,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
  ))
  const next = dedupeWorkspaces([general, ...storedProjects, ...repos])
  writeStore(next)
  return next
}

export function getWorkspaceById(id: string | undefined): Workspace | null {
  if (!id) return null
  return readStore().find((workspace) => workspace.id === id) ?? null
}

export function getWorkspaceForProjectPath(projectPath: string | undefined): Workspace | null {
  const repoRoot = projectPath ? findGitRoot(projectPath) ?? directoryForPath(projectPath) : null
  const workspaces = readStore()
  if (!repoRoot) {
    const general = workspaces.find((workspace) => workspace.kind === 'general') ?? generalWorkspace()
    if (!workspaces.some((workspace) => workspace.id === general.id)) writeStore(dedupeWorkspaces([general, ...workspaces]))
    return general
  }
  const existing = workspaces.find((workspace) => workspace.kind === 'repo' && workspace.projectPath === repoRoot)
  if (existing) return existing
  const timestamp = nowIso()
  const created: Workspace = {
    id: randomUUID(),
    name: path.basename(repoRoot) || repoRoot,
    kind: 'repo',
    projectPath: repoRoot,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  writeStore(dedupeWorkspaces([created, ...workspaces]))
  return created
}

export function addWorkspaceForProjectPath(projectPath: string): Workspace[] {
  getWorkspaceForProjectPath(projectPath)
  return getWorkspaces()
}
