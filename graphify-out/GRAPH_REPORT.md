# Graph Report - relay  (2026-05-20)

## Corpus Check
- 48 files · ~44,167 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 514 nodes · 1006 edges · 36 communities (33 shown, 3 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 61 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0e19fee1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]

## God Nodes (most connected - your core abstractions)
1. `sendMessage()` - 27 edges
2. `writePrivateJson()` - 24 edges
3. `refreshConnections()` - 12 edges
4. `Relay` - 12 edges
5. `cloneImportedConversation()` - 11 edges
6. `getOllamaConfig()` - 11 edges
7. `readStore()` - 10 edges
8. `Main Process (Node.js)` - 10 edges
9. `getGeminiModel()` - 9 edges
10. `executeWorkflowRun()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `sessionboard` --conceptually_related_to--> `Relay`  [AMBIGUOUS]
  src/renderer/index.html → README.md
- `./src/main.tsx` --conceptually_related_to--> `Renderer (React + Zustand)`  [INFERRED]
  src/renderer/index.html → README.md
- `writeConfig()` --calls--> `writePrivateJson()`  [INFERRED]
  src/main/cursor-auth.ts → src/main/private-json.ts
- `sendMessage()` --calls--> `isCursorConnected()`  [INFERRED]
  src/main/chat.ts → src/main/cursor-auth.ts
- `readCursorSnapshot()` --calls--> `isCursorConnected()`  [INFERRED]
  src/main/connectors.ts → src/main/cursor-auth.ts

## Hyperedges (group relationships)
- **Provider Families Supported by Relay** — README_MultiProviderRouting, README_Anthropic, README_OpenAICodex, README_GoogleGemini, README_Ollama, README_CursorSDK [EXTRACTED 1.00]
- **Electron Architecture Flow** — README_RendererReactZustand, README_IPCBridgePreload, README_MainProcessNode [EXTRACTED 1.00]
- **Streaming Provider Pattern** — README_StreamingProviderPattern, README_openai_codex_ts, README_gemini_ts, README_ollama_ts, README_cursor_agent_ts, README_RendererReactZustand [EXTRACTED 1.00]

## Communities (36 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (69): buildContextPacket(), buildSystemContext(), captureWorkspaceSnapshot(), cloneImportedConversation(), codexRowRevision(), compactConversation(), deleteConversation(), deriveProjectFromPath() (+61 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (49): appendOutputPreview(), appendTerminalOutput(), buildStatusMenu(), createTerminalSession(), createTray(), createWindow(), emitCodexStatusSnapshot(), emitConversationSnapshot() (+41 more)

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (38): claudeProviderSummary(), codexAutomationItems(), getAutomationCatalog(), hasCodexAutomationStore(), parseCodexAutomation(), parseTomlScalar(), readJson(), readText() (+30 more)

### Community 3 - "Community 3"
Cohesion: 0.1
Nodes (32): Anthropic, Chat Modes, Conversation Import, Conversation Memory, Cursor SDK, Electron App, Google Gemini, IPC Bridge (preload) (+24 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (25): disconnectOllama(), isOllamaConfigured(), readConfig(), saveOllamaConfig(), writeConfig(), writePrivateJson(), getUsageLimits(), normalizeLimits() (+17 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (20): clearCredentials(), decodeJwtPayload(), exchangeCode(), extractFromIdToken(), getValidAccessToken(), isOpenAIConnected(), isTokenExpired(), readCredentials() (+12 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (6): jumpToLatest(), linesToList(), loadProviderState(), refreshCursorModels(), save(), scrollToLatest()

### Community 7 - "Community 7"
Cohesion: 0.18
Nodes (21): getConnectorInventory(), makeEntry(), readClaudeSnapshot(), readCodexSnapshot(), readCursorSnapshot(), readDeepSeekSnapshot(), readEnabledCodexPlugins(), readGeminiSnapshot() (+13 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (3): handleShowMoreProject(), handleToggleProject(), projectKey()

### Community 9 - "Community 9"
Cohesion: 0.17
Nodes (12): handleConnectOpenAI(), handleDisconnectCursor(), handleDisconnectDeepSeek(), handleDisconnectGemini(), handleDisconnectOllama(), handleDisconnectOpenAI(), handleInstallOllamaModel(), handlePickModel() (+4 more)

### Community 10 - "Community 10"
Cohesion: 0.24
Nodes (16): buildPrompt(), describeTool(), formatTranscript(), listCursorModels(), streamCursorAgentMessage(), textFromAssistantMessage(), validateCursorKey(), disconnectCursor() (+8 more)

### Community 11 - "Community 11"
Cohesion: 0.29
Nodes (12): clearConfig(), disconnectDeepSeek(), getDeepSeekApiKey(), getDeepSeekModel(), isDeepSeekConnected(), readConfig(), saveDeepSeekKey(), saveDeepSeekModel() (+4 more)

### Community 13 - "Community 13"
Cohesion: 0.3
Nodes (11): buildItem(), codexStatusRevision(), extractAssistantText(), getCodexStatusSnapshot(), inferState(), nowIso(), parseIso(), parseRollout() (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.42
Nodes (11): checkOllamaReachable(), ensureOllamaRunning(), findOllamaBinary(), openOllamaApp(), ping(), pullOllamaModel(), spawnBinary(), startAndGetModels() (+3 more)

### Community 16 - "Community 16"
Cohesion: 0.24
Nodes (3): handleLaunchTerminal(), handleLaunchWorkflow(), refreshTasks()

### Community 20 - "Community 20"
Cohesion: 0.38
Nodes (3): aggregateRows(), monthLabel(), summarizeUsage()

### Community 21 - "Community 21"
Cohesion: 0.52
Nodes (6): decide(), decideCursor(), decideOllama(), estimateTokens(), labelForModel(), route()

### Community 24 - "Community 24"
Cohesion: 0.6
Nodes (3): onKeyDown(), selectSkill(), submit()

### Community 25 - "Community 25"
Cohesion: 0.7
Nodes (4): collectSkillFiles(), getSkills(), loadSkillsFrom(), parseFrontmatter()

## Ambiguous Edges - Review These
- `Relay` → `sessionboard`  [AMBIGUOUS]
  src/renderer/index.html · relation: conceptually_related_to

## Knowledge Gaps
- **7 isolated node(s):** `Mission Control for AI Coding Sessions`, `Cursor SDK`, `Token Usage Dashboard`, `Chat Modes`, `router.ts` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Relay` and `sessionboard`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `writePrivateJson()` connect `Community 4` to `Community 0`, `Community 1`, `Community 2`, `Community 5`, `Community 7`, `Community 10`, `Community 11`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `sendMessage()` connect `Community 0` to `Community 1`, `Community 4`, `Community 5`, `Community 7`, `Community 10`, `Community 11`, `Community 21`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `route()` connect `Community 21` to `Community 0`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `sendMessage()` (e.g. with `isOpenAIConnected()` and `isGeminiConnected()`) actually correct?**
  _`sendMessage()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `writePrivateJson()` (e.g. with `writeStore()` and `writeConfig()`) actually correct?**
  _`writePrivateJson()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Mission Control for AI Coding Sessions`, `Cursor SDK`, `Token Usage Dashboard` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._