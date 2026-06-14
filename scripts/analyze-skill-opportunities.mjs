#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const home = os.homedir()
const repoRoot = process.cwd()
const outDir = path.join(repoRoot, 'docs', 'skill-opportunities')

const codexDbPath = path.join(home, '.codex', 'state_5.sqlite')
const claudeProjectsPath = path.join(home, '.claude', 'projects')
const relayStorePath = path.join(home, 'Library', 'Application Support', 'relay', 'conversations.json')

const categories = [
  {
    id: 'relay-product-dev',
    name: 'Relay product development',
    skillName: 'relay-product-dev',
    minScore: 7,
    minKeywordScore: 5,
    keywords: [
      'relay', 'electron', 'ipc', 'renderer', 'preload', 'zustand', 'terminal',
      'conversation', 'workspace', 'sidebar', 'chat', 'codex', 'claude', 'gemini',
      'agent', 'sub agent', 'workflow', 'automation',
    ],
    toolSignals: ['npm', 'tsc', 'vite', 'electron', 'rg', 'sed', 'apply_patch'],
    firstVersion: 'Start from repo state, inspect the relevant main/preload/renderer files, make scoped TypeScript changes, run typecheck/build, and summarize files touched plus verification.',
  },
  {
    id: 'github-sync-pr',
    name: 'GitHub sync, branch, and PR workflow',
    skillName: 'github-sync-pr',
    minScore: 5,
    minKeywordScore: 4,
    keywords: [
      'github', 'git', 'branch', 'commit', 'push', 'pull', 'merge', 'rebase',
      'pr', 'pull request', 'latest', 'catch up', 'status', 'dirty', 'remote',
    ],
    toolSignals: ['git', 'gh'],
    firstVersion: 'Check status/remotes/branch, fetch, reconcile safely without discarding user changes, run project checks when code changed, then commit/push/open or update PR when requested.',
  },
  {
    id: 'visual-frontend-qa',
    name: 'Visual frontend implementation and QA',
    skillName: 'visual-frontend-qa',
    minScore: 5,
    minKeywordScore: 4,
    keywords: [
      'ui', 'design', 'frontend', 'screen', 'screenshot', 'browser', 'layout',
      'mobile', 'desktop', 'css', 'component', 'responsive', 'visual', 'canvas',
      'hero', 'animation',
    ],
    toolSignals: ['npm', 'playwright', 'screenshot', 'browser', 'vite'],
    firstVersion: 'Implement UI changes against existing design patterns, run the local app, verify with desktop/mobile screenshots, and fix visible overlap, blank states, and responsive issues.',
  },
  {
    id: 'mobbin-design-research',
    name: 'Mobbin design research ingestion',
    skillName: 'mobbin-design-research',
    minScore: 5,
    minKeywordScore: 4,
    keywords: [
      'mobbin', 'app screens', 'screens', 'design research', 'airbnb', 'ios',
      'android', 'ingest', 'drive upload', 'screen_queries', 'app flows',
    ],
    toolSignals: ['mobbin', 'ts-node', 'ingest', 'drive'],
    firstVersion: 'Search Mobbin with query batches, ingest normalized screen records, verify database counts and Drive upload coverage, and report gaps or rate-limit state.',
  },
  {
    id: 'conversation-mining',
    name: 'Conversation mining for workflow discovery',
    skillName: 'conversation-mining',
    minScore: 5,
    minKeywordScore: 4,
    keywords: [
      'conversation', 'transcript', 'history', 'skills', 'workflow', 'repeat',
      'cluster', 'analyze', 'relay captured', 'agent conversations',
    ],
    toolSignals: ['sqlite3', 'jsonl', 'node'],
    firstVersion: 'Read Codex, Claude, and Relay histories; normalize sessions; classify intents and tool chains; produce ranked skill candidates with evidence and draft SKILL.md files.',
  },
  {
    id: 'local-data-reporting',
    name: 'Local data analysis and reporting',
    skillName: 'local-data-reporting',
    minScore: 6,
    minKeywordScore: 5,
    keywords: [
      'analyze', 'report', 'csv', 'json', 'sqlite', 'database', 'stats',
      'count', 'cluster', 'summarize', 'export', 'dashboard',
    ],
    toolSignals: ['sqlite3', 'node', 'jq', 'csv'],
    firstVersion: 'Locate the local data source, write a reproducible parser or query, emit both machine-readable data and a concise Markdown report, and include caveats.',
  },
  {
    id: 'skill-authoring',
    name: 'Skill authoring and rollout',
    skillName: 'personal-skill-authoring',
    minScore: 4,
    minKeywordScore: 4,
    keywords: [
      'skill', 'skills', 'skill.md', 'plugin', 'workflow', 'prompt', 'use any skills',
      'install skill', 'create skill', 'update skill',
    ],
    toolSignals: ['skill-creator', 'apply_patch'],
    firstVersion: 'Convert repeated prompts into concise skill bodies with strong trigger descriptions, draft examples, and a small validation plan before installation.',
  },
  {
    id: 'system-automation',
    name: 'Local system and app automation',
    skillName: 'local-system-automation',
    minScore: 5,
    minKeywordScore: 4,
    keywords: [
      'mac', 'window', 'fullscreen', 'screen', 'desktop', 'browser', 'chrome',
      'app', 'automation', 'keyboard', 'video', 'quadrant',
    ],
    toolSignals: ['open', 'osascript', 'computer', 'browser', 'ps'],
    firstVersion: 'Inspect the local app/system state, prefer reversible settings or scripts, ask before externally visible actions, and document cleanup/reversal steps.',
  },
]

function safeJsonParse(line) {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function readJsonLines(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map(safeJsonParse)
      .filter(Boolean)
  } catch {
    return []
  }
}

function walkJsonl(root) {
  const files = []
  function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(full)
    }
  }
  walk(root)
  return files
}

function textFromCodexContent(content) {
  if (!Array.isArray(content)) return ''
  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      if ((item.type === 'input_text' || item.type === 'output_text') && typeof item.text === 'string') return item.text
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function textFromClaudeContent(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((item) => item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string' ? item.text : '')
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function extractCommandsFromArguments(args) {
  if (!args || typeof args !== 'string') return []
  const parsed = safeJsonParse(args)
  const cmd = parsed && typeof parsed.cmd === 'string' ? parsed.cmd : ''
  if (!cmd) return []
  return [cmd]
}

function commandName(cmd) {
  const trimmed = cmd.trim()
  if (!trimmed) return ''
  const firstSegment = trimmed.split(/\s*(?:&&|\|\||;|\|)\s*/)[0] ?? trimmed
  return firstSegment.split(/\s+/)[0].replace(/^.*\//, '')
}

function extractFileRefs(text) {
  const refs = new Set()
  for (const match of text.matchAll(/(?:^|[\s`'"])([\w@./-]+\.(?:ts|tsx|js|jsx|json|css|scss|md|mdx|py|go|rs|toml|yml|yaml|html|sql|sh|mjs|cjs|sqlite|db))(?:$|[\s`'",:;.)\]])/g)) {
    if (!match[1].startsWith('http')) refs.add(match[1])
  }
  return [...refs]
}

function scoreCategory(session, category) {
  return scoreCategoryDetails(session, category).score
}

function scoreCategoryDetails(session, category) {
  const intentHaystack = [
    session.title,
    ...session.userPrompts,
  ].join('\n').toLowerCase()
  const signalHaystack = [
    ...session.commands,
    ...session.tools,
    ...session.files,
    ...session.assistantSnippets.slice(-2),
  ].join('\n').toLowerCase()
  let keywordScore = 0
  let toolScore = 0
  for (const keyword of category.keywords) {
    if (intentHaystack.includes(keyword.toLowerCase())) keywordScore += keyword.includes(' ') ? 3 : 1
  }
  for (const signal of category.toolSignals) {
    if (signalHaystack.includes(signal.toLowerCase())) toolScore += 2
  }
  return { score: keywordScore + toolScore, keywordScore, toolScore }
}

function matchingCategories(session) {
  return categories
    .map((category) => ({ category, ...scoreCategoryDetails(session, category) }))
    .filter(({ category, score, keywordScore }) => (
      score >= (category.minScore ?? 5) &&
      keywordScore >= (category.minKeywordScore ?? 3)
    ))
    .sort((a, b) => b.score - a.score)
}

function readCodexRows() {
  if (!fs.existsSync(codexDbPath)) return []
  try {
    const output = execFileSync('sqlite3', [
      '-json',
      codexDbPath,
      "select id,title,cwd,datetime(created_at,'unixepoch') as created_at,datetime(updated_at,'unixepoch') as updated_at,first_user_message,rollout_path,tokens_used from threads where archived=0 order by updated_at desc;",
    ], { encoding: 'utf8' })
    return JSON.parse(output)
  } catch {
    return []
  }
}

function parseCodexSession(row) {
  const entries = readJsonLines(row.rollout_path)
  const userPrompts = []
  const assistantSnippets = []
  const commands = []
  const tools = []
  const files = new Set()

  for (const entry of entries) {
    if (entry.type === 'response_item' && entry.payload?.type === 'message') {
      const text = textFromCodexContent(entry.payload.content)
      if (!text || text.includes('<environment_context>')) continue
      if (entry.payload.role === 'user') userPrompts.push(text)
      if (entry.payload.role === 'assistant') assistantSnippets.push(text.slice(0, 1200))
      for (const ref of extractFileRefs(text)) files.add(ref)
    }
    if (entry.type === 'event_msg' && entry.payload?.type === 'user_message' && typeof entry.payload.message === 'string') {
      userPrompts.push(entry.payload.message)
      for (const ref of extractFileRefs(entry.payload.message)) files.add(ref)
    }
    if (entry.type === 'response_item' && entry.payload?.type === 'function_call') {
      tools.push(entry.payload.name)
      const nextCommands = extractCommandsFromArguments(entry.payload.arguments)
      commands.push(...nextCommands)
      for (const cmd of nextCommands) for (const ref of extractFileRefs(cmd)) files.add(ref)
    }
  }

  return {
    id: `codex:${row.id}`,
    source: 'codex',
    title: row.title || row.first_user_message || 'Codex session',
    cwd: row.cwd,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tokensUsed: row.tokens_used ?? 0,
    userPrompts,
    assistantSnippets,
    commands,
    tools,
    files: [...files],
  }
}

function parseClaudeSession(filePath) {
  const rows = readJsonLines(filePath)
  const userPrompts = []
  const assistantSnippets = []
  const commands = []
  const tools = []
  const files = new Set()
  let cwd = ''
  let sessionId = path.basename(filePath, '.jsonl')
  let createdAt = ''
  let updatedAt = ''
  let title = ''

  for (const row of rows) {
    if (typeof row.sessionId === 'string') sessionId = row.sessionId
    if (typeof row.cwd === 'string' && !cwd) cwd = row.cwd
    if (typeof row.timestamp === 'string' && !createdAt) createdAt = row.timestamp
    if (typeof row.timestamp === 'string') updatedAt = row.timestamp
    if (row.type === 'user' || row.type === 'assistant') {
      const role = row.message?.role
      const text = textFromClaudeContent(row.message?.content)
      if (!text) continue
      if (role === 'user') {
        userPrompts.push(text)
        if (!title) title = text.split('\n')[0].slice(0, 140)
      }
      if (role === 'assistant') assistantSnippets.push(text.slice(0, 1200))
      for (const ref of extractFileRefs(text)) files.add(ref)
    }
    if (row.type === 'assistant' && Array.isArray(row.message?.content)) {
      for (const item of row.message.content) {
        if (item?.type === 'tool_use' && typeof item.name === 'string') {
          tools.push(item.name)
          if (item.input?.command) commands.push(String(item.input.command))
        }
      }
    }
    if (row.type === 'tool_use' && typeof row.name === 'string') tools.push(row.name)
  }

  return {
    id: `claude:${sessionId}`,
    source: 'claude',
    title: title || 'Claude session',
    cwd,
    createdAt,
    updatedAt,
    tokensUsed: 0,
    userPrompts,
    assistantSnippets,
    commands,
    tools,
    files: [...files],
  }
}

function parseRelaySessions() {
  if (!fs.existsSync(relayStorePath)) return []
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(relayStorePath, 'utf8'))
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  return raw.map((conv) => {
    const userPrompts = []
    const assistantSnippets = []
    const files = new Set()
    for (const message of conv.messages ?? []) {
      if (message.role === 'user') userPrompts.push(message.content)
      if (message.role === 'assistant') assistantSnippets.push(String(message.content ?? '').slice(0, 1200))
      for (const ref of extractFileRefs(String(message.content ?? ''))) files.add(ref)
    }
    for (const ref of conv.memory?.filesTouched ?? []) files.add(ref)
    for (const ref of conv.resumeState?.filesTouched ?? []) files.add(ref)
    return {
      id: `relay:${conv.id}`,
      source: 'relay',
      title: conv.title || conv.memory?.activeGoal || 'Relay conversation',
      cwd: conv.projectPath ?? '',
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt ?? conv.createdAt,
      tokensUsed: (conv.messages ?? []).reduce((sum, message) => sum + (message.usage?.totalTokens ?? 0), 0),
      userPrompts,
      assistantSnippets,
      commands: conv.resumeState?.commandsRun ?? [],
      tools: (conv.toolEventSummaries ?? []).map((event) => event.kind),
      files: [...files],
    }
  })
}

function buildCluster(category, sessions) {
  const commands = new Map()
  const tools = new Map()
  const files = new Map()
  const projects = new Map()
  const prompts = []
  let tokenTotal = 0

  for (const session of sessions) {
    tokenTotal += Number(session.tokensUsed ?? 0)
    const project = session.cwd ? path.basename(session.cwd) : '(unknown)'
    projects.set(project, (projects.get(project) ?? 0) + 1)
    for (const cmd of session.commands) {
      const name = commandName(cmd)
      if (name) commands.set(name, (commands.get(name) ?? 0) + 1)
    }
    for (const tool of session.tools) tools.set(tool, (tools.get(tool) ?? 0) + 1)
    for (const file of session.files) files.set(file, (files.get(file) ?? 0) + 1)
    if (session.userPrompts[0]) prompts.push({
      title: session.title,
      source: session.source,
      updatedAt: session.updatedAt,
      prompt: session.userPrompts[0].replace(/\s+/g, ' ').slice(0, 260),
    })
  }

  const count = sessions.length
  const uniqueProjects = projects.size
  const toolDensity = [...commands.values()].reduce((a, b) => a + b, 0) + [...tools.values()].reduce((a, b) => a + b, 0)
  const repeatScore = count * 2
  const procedureScore = Math.min(20, toolDensity)
  const localityScore = uniqueProjects <= 3 ? 8 : 4
  const evidenceScore = Math.min(10, Math.ceil(tokenTotal / 1_000_000))
  const score = repeatScore + procedureScore + localityScore + evidenceScore

  return {
    id: category.id,
    name: category.name,
    skillName: category.skillName,
    count,
    score,
    tokenTotal,
    projects: top(projects, 8),
    commands: top(commands, 12),
    tools: top(tools, 12),
    files: top(files, 12),
    representativePrompts: prompts.slice(0, 6),
    firstVersion: category.firstVersion,
  }
}

function top(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))
}

function skillBody(cluster) {
  const commandHints = cluster.commands.slice(0, 6).map((entry) => entry.name).join(', ') || 'repo-local tools'
  const projectHints = cluster.projects.slice(0, 4).map((entry) => entry.name).join(', ') || 'the current project'
  return `---\nname: ${cluster.skillName}\ndescription: Use when the user asks for ${cluster.name.toLowerCase()} or gives a prompt that matches the repeated workflow evidence from Relay conversation history. This skill is a first draft generated from local Codex, Claude, and Relay transcripts; refine after two or three real uses.\n---\n\n# ${cluster.name}\n\n## Workflow\n\n1. Restate the concrete task and identify the active project. Common projects from history: ${projectHints}.\n2. Gather local context before changing anything. Prefer targeted searches and existing project scripts.\n3. Follow the stable first-pass procedure: ${cluster.firstVersion}\n4. Preserve user changes. Do not discard unrelated dirty work.\n5. Verify with the smallest check that proves the requested behavior. Common command/tool signals from history: ${commandHints}.\n6. Finish with changed files, verification performed, residual risks, and a concrete next step only when useful.\n\n## Evidence To Preserve\n\n- Observed sessions: ${cluster.count}\n- Skill score: ${cluster.score}\n- Representative prompts:\n${cluster.representativePrompts.slice(0, 4).map((item) => `  - ${item.prompt}`).join('\n') || '  - No prompt samples available.'}\n\n## Refinement Notes\n\nAfter using this skill, update it with exact project conventions, expected output shape, recurring checks, and known failure modes. Keep this file concise; move long examples or schemas into references only if they are repeatedly needed.\n`
}

function markdownReport(clusters, misc, sessions) {
  const totalPrompts = sessions.reduce((sum, session) => sum + session.userPrompts.length, 0)
  const totalCommands = sessions.reduce((sum, session) => sum + session.commands.length, 0)
  const sourceCounts = top(sessions.reduce((map, session) => {
    map.set(session.source, (map.get(session.source) ?? 0) + 1)
    return map
  }, new Map()), 10)
  const generatedAt = new Date().toISOString()

  const lines = [
    '# Skill Opportunity Report',
    '',
    `Generated: ${generatedAt}`,
    '',
    '## Corpus',
    '',
    `- Sessions parsed: ${sessions.length}`,
    `- User prompts parsed: ${totalPrompts}`,
    `- Commands parsed: ${totalCommands}`,
    `- Sources: ${sourceCounts.map((entry) => `${entry.name} ${entry.count}`).join(', ')}`,
    `- Misc/unclassified sessions: ${misc.length}`,
    '',
    '## Ranked Candidates',
    '',
    '| Rank | Candidate skill | Sessions | Score | Evidence | First version |',
    '|---:|---|---:|---:|---|---|',
    ...clusters.map((cluster, index) => {
      const evidence = [
        cluster.projects[0] ? `top project: ${cluster.projects[0].name}` : '',
        cluster.commands[0] ? `top command: ${cluster.commands[0].name}` : '',
        cluster.tools[0] ? `top tool: ${cluster.tools[0].name}` : '',
      ].filter(Boolean).join('; ')
      return `| ${index + 1} | ${cluster.name} | ${cluster.count} | ${cluster.score} | ${escapeTable(evidence || 'prompt/content matches')} | ${escapeTable(cluster.firstVersion)} |`
    }),
    '',
    '## Candidate Details',
    '',
  ]

  for (const cluster of clusters) {
    lines.push(`### ${cluster.name}`)
    lines.push('')
    lines.push(`- Draft skill: \`docs/skill-opportunities/drafts/${cluster.skillName}/SKILL.md\``)
    lines.push(`- Sessions: ${cluster.count}`)
    lines.push(`- Score: ${cluster.score}`)
    lines.push(`- Top projects: ${cluster.projects.map((entry) => `${entry.name} (${entry.count})`).join(', ') || 'n/a'}`)
    lines.push(`- Top commands: ${cluster.commands.map((entry) => `${entry.name} (${entry.count})`).join(', ') || 'n/a'}`)
    lines.push(`- Top tools: ${cluster.tools.map((entry) => `${entry.name} (${entry.count})`).join(', ') || 'n/a'}`)
    lines.push('')
    lines.push('Representative prompts:')
    for (const prompt of cluster.representativePrompts.slice(0, 5)) {
      lines.push(`- ${prompt.updatedAt ?? ''} [${prompt.source}] ${prompt.prompt}`)
    }
    lines.push('')
  }

  lines.push('## Interpretation')
  lines.push('')
  lines.push('The strongest candidates are the workflows with repeated prompts plus repeated command/tool chains. A low-count cluster can still be valuable when it is procedural and expensive, but the first install candidates should be high-count and high-score.')
  lines.push('')
  lines.push('Recommended first experiment: install or manually invoke the top three draft skills for the next matching task, then compare prompt length, corrections, verification quality, and whether the skill actually triggers at the right time.')
  lines.push('')

  return lines.join('\n')
}

function escapeTable(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function main() {
  const codexSessions = readCodexRows().map(parseCodexSession)
  const claudeSessions = fs.existsSync(claudeProjectsPath)
    ? walkJsonl(claudeProjectsPath)
      .filter((file) => !file.includes(`${path.sep}subagents${path.sep}`))
      .map(parseClaudeSession)
    : []
  const relaySessions = parseRelaySessions()
  const sessions = [...codexSessions, ...claudeSessions, ...relaySessions]
    .filter((session) => session.userPrompts.length || session.commands.length || session.assistantSnippets.length)

  const grouped = new Map()
  const misc = []
  for (const session of sessions) {
    const matches = matchingCategories(session)
    if (!matches.length) {
      misc.push(session)
      continue
    }
    for (const { category } of matches) {
      if (!grouped.has(category.id)) grouped.set(category.id, [])
      grouped.get(category.id).push(session)
    }
  }

  const clusters = categories
    .filter((category) => grouped.has(category.id))
    .map((category) => buildCluster(category, grouped.get(category.id)))
    .filter((cluster) => cluster.count >= 2 || cluster.score >= 15)
    .sort((a, b) => b.score - a.score || b.count - a.count)

  fs.mkdirSync(path.join(outDir, 'drafts'), { recursive: true })
  fs.writeFileSync(path.join(outDir, 'skill-opportunities.json'), JSON.stringify({ generatedAt: new Date().toISOString(), clusters, miscCount: misc.length }, null, 2))
  fs.writeFileSync(path.join(outDir, 'report.md'), markdownReport(clusters, misc, sessions))

  for (const cluster of clusters.slice(0, 6)) {
    const skillDir = path.join(outDir, 'drafts', cluster.skillName)
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillBody(cluster))
  }

  console.log(JSON.stringify({
    sessions: sessions.length,
    clusters: clusters.map((cluster) => ({ id: cluster.id, count: cluster.count, score: cluster.score })),
    report: path.join(outDir, 'report.md'),
  }, null, 2))
}

main()
