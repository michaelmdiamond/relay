# Relay Continuity Spec

## Purpose

Relay should let a user reopen old work and continue it without rebuilding context manually. The target experience is closer to Codex and Claude desktop threads than a disposable chat: old decisions, workspace state, files touched, terminal/task links, and next steps remain attached to the conversation.

This spec covers durable conversation continuity and restartable working context. It does not require preserving a live model process across app restarts.

## Goals

- Persist Relay conversations as durable, reopenable threads.
- Bind each thread to a workspace, repo, branch, and last known commit when available.
- Maintain structured resume state that can be injected into future model turns.
- Make old work findable by workspace, title, date, status, branch, file, and text search.
- Provide a clear resume flow when reopening a stale thread.
- Keep imported Codex and Claude conversations read-only, but allow starting a new Relay thread from imported history.
- Preserve enough tool and terminal history to explain what was tried without replaying raw logs into the model.

## Non-Goals

- No attempt to keep model processes alive after app quit.
- No full replay of every message/tool event into every resumed prompt.
- No cross-device sync in the first pass.
- No Git checkpoint or branch rollback system in the MVP.
- No semantic/vector search requirement in the MVP.

## User Experience

### Thread List

The sidebar should treat conversations as durable threads. A thread can be:

- Active
- Paused
- Completed
- Archived

Thread rows should show title, workspace/project, relative updated time, and a lightweight status signal. Search should include title, project path, branch, files touched, latest messages, and summary text.

### Reopen Thread

When a user opens an old thread, Relay should display a compact resume panel above the message history when the thread has been inactive for a meaningful interval, such as 24 hours.

The panel should include:

- Last active timestamp
- Workspace/repo
- Branch and last known commit, when available
- Active goal
- Current state
- Open questions
- Next suggested step
- Files touched
- Related task or terminal links

Primary actions:

- `Continue`: send a model turn with hydrated resume context.
- `Edit summary`: update the structured resume fields before continuing.
- `Archive`: hide the thread from active views.

### Continue From Imported History

Imported Claude and Codex conversations remain read-only. From an imported conversation, the user should be able to create a new Relay thread that copies:

- Source conversation reference
- Workspace/project metadata
- Title
- Summary of imported history
- Recent user/assistant messages as context

The new thread should be editable and should become the durable Relay thread from that point forward.

## Data Model

Extend `Conversation` with explicit thread lifecycle and resume metadata.

```ts
export type ThreadStatus = 'active' | 'paused' | 'completed' | 'archived'

export interface ThreadWorkspaceSnapshot {
  workspaceId?: string
  projectName?: string
  projectPath?: string
  gitRemote?: string
  gitBranch?: string
  gitCommit?: string
  capturedAt: string
}

export interface ThreadResumeState {
  userGoal?: string
  currentState?: string
  decisions: string[]
  constraints: string[]
  filesTouched: string[]
  commandsRun: string[]
  testsRun: string[]
  blockers: string[]
  openQuestions: string[]
  nextSteps: string[]
  updatedAt: string
  generatedFromMessageId?: string
}

export interface ThreadToolEventSummary {
  id: string
  kind: 'terminal' | 'task' | 'workflow' | 'file' | 'git' | 'external'
  title: string
  detail?: string
  status?: 'succeeded' | 'failed' | 'canceled' | 'unknown'
  createdAt: string
  relatedId?: string
}
```

Add fields to `Conversation`:

```ts
status?: ThreadStatus
workspaceSnapshot?: ThreadWorkspaceSnapshot
resumeState?: ThreadResumeState
toolEventSummaries?: ThreadToolEventSummary[]
archivedAt?: string
completedAt?: string
sourceConversationId?: string
```

Relationship to existing fields:

- `memory` remains the turn-level compact model context.
- `resumeState` becomes the user-visible, structured restart summary.
- `contextPacket` remains per-request diagnostics and context capture.
- `workspaceId`, `projectName`, and `projectPath` remain denormalized convenience fields, with `workspaceSnapshot` preserving exact resume context.

## Storage

The MVP can continue using local JSON files under Electron `userData`.

Current:

- `conversations.json`
- `terminal-sessions.json`
- `workspaces.json`
- task and workflow stores

Add:

- No required new file for MVP if thread metadata is embedded in `conversations.json`.
- Optional later `thread-events.json` if tool history grows too large for conversation records.

Storage rules:

- Normalize missing `status` to `active`.
- Normalize missing `resumeState` to an empty state.
- Do not mutate imported read-only conversations except for transient UI links.
- Keep raw terminal scrollback in `terminal-sessions.json`; store only summaries on the conversation.

## Resume Context Construction

When continuing a stale thread, the model should receive a resume block before the user request.

The block should include:

- Workspace snapshot
- Resume state
- Recent messages, capped
- Files touched, with existing file-preview retrieval
- Tool event summaries
- Current repo state if available and cheap to compute

Prompt shape:

```text
Relay resume context:

Workspace:
- Project: relay
- Path: /Users/michael/Documents/GitHub/relay
- Branch at last update: codex/workspace-continuity
- Commit at last update: c471871

Goal:
...

Current state:
...

Decisions:
- ...

Files touched:
- ...

Known tool results:
- npm run build passed at ...

Next steps:
- ...
```

The model should not be told that a live process was restored. The language should be explicit that Relay reconstructed context from durable state.

## Summary Generation

Resume state should update after meaningful turns, not on every keystroke.

Triggers:

- Assistant response completes and conversation has at least 4 total messages.
- User manually clicks `Update summary`.
- Thread status changes to paused/completed.
- A task, workflow, or terminal becomes linked to the conversation.

MVP implementation can use deterministic extraction first:

- Active goal from existing `memory.activeGoal` or first/latest user intent.
- Files from `memory.filesTouched`, context packets, and file-reference extraction.
- Commands/tests from terminal/task summaries where available.
- Current state and next steps from existing `memory.summary`.

Later, add model-generated structured summaries using the active provider, with user review and fallback to deterministic extraction.

## API and IPC

Add main-process operations:

```ts
getThread(id: string): Promise<Conversation | null>
updateThreadStatus(id: string, status: ThreadStatus): Promise<Conversation | null>
updateThreadResumeState(id: string, state: Partial<ThreadResumeState>): Promise<Conversation | null>
continueThread(id: string, userMessage?: string, options?: SendMessageOptions): Promise<void>
cloneImportedConversation(sourceId: string): Promise<Conversation>
searchThreads(query: ThreadSearchQuery): Promise<Conversation[]>
```

`continueThread` can initially call existing `sendMessage` with an internal resume attachment or option. Avoid creating a separate message dispatch path unless it removes meaningful complexity.

## Search

MVP search remains local and lexical.

Search fields:

- `title`
- `projectName`
- `projectPath`
- `workspaceSnapshot.gitBranch`
- `resumeState.userGoal`
- `resumeState.currentState`
- `resumeState.filesTouched`
- `resumeState.nextSteps`
- Recent message content

Filters:

- Workspace
- Status
- Source: Relay, Claude, Codex
- Updated date range
- Has open next steps

Later:

- SQLite FTS
- Semantic search over summaries and titles
- File-scoped search results

## UI Changes

### Sidebar

- Add status filter: Active, Paused, Completed, Archived.
- Show archived threads only when explicitly filtered.
- Keep workspace scoping from the current branch.
- Include branch/project metadata in search matching.

### Chat Pane

- Add `ResumePanel` for stale or paused threads.
- Add `ThreadSummaryEditor` for structured resume state.
- Add actions to mark completed, pause, archive, and reactivate.
- For read-only imports, show `Continue in Relay` instead of only telling the user to start a new chat.

### Tasks and Terminals

- When promoting a conversation to a task, copy `resumeState.userGoal`, `currentState`, and `nextSteps` into task defaults.
- When launching a terminal from a thread/task, append a `ThreadToolEventSummary`.
- When a terminal exits, summarize last command/test result if possible.

## Migration

On read:

- Add `status: 'active'` to existing Relay conversations.
- Add an empty `resumeState` with `decisions`, `filesTouched`, `nextSteps`, and other arrays defaulted to `[]`.
- Capture `workspaceSnapshot` from existing `workspaceId`, `projectName`, and `projectPath` when missing.

On write:

- Persist normalized thread metadata.
- Do not rewrite imported conversations into `conversations.json`.

## Phases

### Phase 1: Durable Thread Metadata

- Add thread lifecycle types and normalization.
- Add status/archive controls.
- Add workspace snapshots.
- Add read-only import clone flow.
- Add basic lexical search across resume fields.

Acceptance:

- User can archive and restore a Relay thread.
- User can create a new Relay thread from a Codex/Claude import.
- Restarting Relay preserves status, workspace snapshot, and resume state.

### Phase 2: Resume State and UI

- Add structured resume state editor.
- Add stale-thread resume panel.
- Hydrate `sendMessage` with resume context when continuing.
- Update resume state deterministically after assistant turns and task/terminal links.

Acceptance:

- Reopening a thread after restart shows a useful summary.
- Clicking `Continue` sends the resume block plus the user request.
- Build and existing chat send flows still pass.

### Phase 3: Tool and Terminal Summaries

- Link terminal/task/workflow events to conversations.
- Store compact tool event summaries.
- Surface commands/tests already tried.
- Use tool summaries in resume context.

Acceptance:

- A resumed thread can show the last linked terminal status and recent test/build result.
- Prompt diagnostics show resume/tool context was included.

### Phase 4: Better Retrieval

- Add richer search filters.
- Consider SQLite FTS if JSON search becomes slow.
- Add model-generated structured summaries with deterministic fallback.

Acceptance:

- User can find old work by filename, branch, task phrase, or next step.
- Summary generation failure does not block chat.

## Risks

- Summary drift: the structured resume state may become inaccurate if generated too aggressively.
- Prompt bloat: resume context can grow unless fields are capped.
- Imported history ambiguity: Codex/Claude data may lack exact workspace or branch state.
- JSON store growth: raw event history should not live inside conversation records.
- UI clutter: continuity controls should be visible when useful, not permanent chrome.

## Open Questions

- Should `Continue` create an explicit system/context message in the visible transcript, or keep resume context only in request diagnostics?
- Should thread status changes be manual only, or should Relay auto-pause stale threads?
- How much Git state should be captured automatically on every turn?
- Should a cloned imported conversation copy recent messages visibly, or only use them as hidden resume context?
- Should terminal sessions be linkable to multiple threads, or only one source thread/task?

