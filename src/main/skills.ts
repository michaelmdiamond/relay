import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { SkillEntry } from '../shared/types'

const HOME = os.homedir()
const CLAUDE_PLUGINS_DIR = path.join(HOME, '.claude', 'plugins')
const CODEX_SKILLS_DIR = path.join(HOME, '.codex', 'skills')

function parseFrontmatter(content: string): { name?: string; description?: string; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { body: content }

  const fm = match[1]
  const body = match[2].trim()

  // Handles both `name: foo` and `name: "foo"`
  const nameMatch = fm.match(/^name:\s*["']?(.*?)["']?\s*$/m)

  // Description may be a multi-line yaml block scalar or a quoted string
  const descMatch = fm.match(/^description:\s*["']?([\s\S]*?)["']?\s*(?=\n\w|$)/m)
  const description = descMatch?.[1]?.trim().replace(/\s+/g, ' ')

  return { name: nameMatch?.[1]?.trim(), description, body }
}

function collectSkillFiles(dir: string): string[] {
  const results: string[] = []
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) results.push(...collectSkillFiles(full))
      else if (entry.name === 'SKILL.md') results.push(full)
    }
  } catch { /* directory missing or unreadable */ }
  return results
}

function loadSkillsFrom(dir: string, provider: 'claude' | 'codex'): SkillEntry[] {
  const skills: SkillEntry[] = []
  for (const filePath of collectSkillFiles(dir)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const { name, description, body } = parseFrontmatter(content)
      if (!name) continue
      skills.push({ id: `${provider}:${name}`, provider, name, description: description ?? '', body })
    } catch { /* skip unreadable files */ }
  }
  return skills
}

export function getSkills(): SkillEntry[] {
  return [
    ...loadSkillsFrom(CLAUDE_PLUGINS_DIR, 'claude'),
    ...loadSkillsFrom(CODEX_SKILLS_DIR, 'codex'),
  ]
}
