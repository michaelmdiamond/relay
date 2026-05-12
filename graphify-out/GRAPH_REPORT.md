# Graph Report - relay  (2026-05-05)

## Corpus Check
- 35 files · ~27,852 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 316 nodes · 603 edges · 28 communities (26 shown, 2 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `237400c5`
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
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]

## God Nodes (most connected - your core abstractions)
1. `sendMessage()` - 24 edges
2. `writePrivateJson()` - 18 edges
3. `Relay` - 12 edges
4. `refreshConnections()` - 10 edges
5. `readStore()` - 10 edges
6. `getOllamaConfig()` - 10 edges
7. `Main Process (Node.js)` - 10 edges
8. `getGeminiModel()` - 9 edges
9. `executeWorkflowRun()` - 9 edges
10. `getValidAccessToken()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `sessionboard` --conceptually_related_to--> `Relay`  [AMBIGUOUS]
  src/renderer/index.html → README.md
- `./src/main.tsx` --conceptually_related_to--> `Renderer (React + Zustand)`  [INFERRED]
  src/renderer/index.html → README.md
- `sendMessage()` --calls--> `streamOllamaMessage()`  [INFERRED]
  src/main/chat.ts → src/main/ollama.ts
- `writeConfig()` --calls--> `writePrivateJson()`  [INFERRED]
  src/main/cursor-auth.ts → src/main/private-json.ts
- `sendMessage()` --calls--> `isCursorConnected()`  [INFERRED]
  src/main/chat.ts → src/main/cursor-auth.ts

## Hyperedges (group relationships)
- **Provider Families Supported by Relay** — README_MultiProviderRouting, README_Anthropic, README_OpenAICodex, README_GoogleGemini, README_Ollama, README_CursorSDK [EXTRACTED 1.00]
- **Electron Architecture Flow** — README_RendererReactZustand, README_IPCBridgePreload, README_MainProcessNode [EXTRACTED 1.00]
- **Streaming Provider Pattern** — README_StreamingProviderPattern, README_openai_codex_ts, README_gemini_ts, README_ollama_ts, README_cursor_agent_ts, README_RendererReactZustand [EXTRACTED 1.00]

## Communities (28 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.1
Nodes (41): buildContextPacket(), buildSystemContext(), compactConversation(), deleteConversation(), deriveProjectFromPath(), deriveTitle(), estimateTokens(), extractClaudeText() (+33 more)

### Community 1 - "Community 1"
Cohesion: 0.1
Nodes (32): Anthropic, Chat Modes, Conversation Import, Conversation Memory, Cursor SDK, Electron App, Google Gemini, IPC Bridge (preload) (+24 more)

### Community 2 - "Community 2"
Cohesion: 0.15
Nodes (28): buildReviewerPrompt(), createStepRun(), defaultAgentProfiles(), defaultStore(), defaultWorkflowDefinitions(), emitUpdatedRun(), executeWorkflowRun(), extractSection() (+20 more)

### Community 3 - "Community 3"
Cohesion: 0.15
Nodes (18): buildPrompt(), describeTool(), formatTranscript(), listCursorModels(), streamCursorAgentMessage(), textFromAssistantMessage(), validateCursorKey(), disconnectCursor() (+10 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (19): clearCredentials(), decodeJwtPayload(), exchangeCode(), extractFromIdToken(), getValidAccessToken(), isTokenExpired(), readCredentials(), refreshCredentials() (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.18
Nodes (21): getConnectorInventory(), makeEntry(), readClaudeSnapshot(), readCodexSnapshot(), readCursorSnapshot(), readEnabledCodexPlugins(), readGeminiSnapshot(), readJsonFile() (+13 more)

### Community 6 - "Community 6"
Cohesion: 0.18
Nodes (10): handleConnectOpenAI(), handleDisconnectCursor(), handleDisconnectGemini(), handleDisconnectOllama(), handleDisconnectOpenAI(), handleInstallOllamaModel(), handlePickModel(), handleSaveCursorKey() (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.13
Nodes (4): linesToList(), loadProviderState(), refreshCursorModels(), save()

### Community 9 - "Community 9"
Cohesion: 0.36
Nodes (12): getOllamaConfig(), checkOllamaReachable(), ensureOllamaRunning(), findOllamaBinary(), openOllamaApp(), ping(), pullOllamaModel(), spawnBinary() (+4 more)

### Community 10 - "Community 10"
Cohesion: 0.24
Nodes (10): disconnectOllama(), isOllamaConfigured(), readConfig(), saveOllamaConfig(), writeConfig(), writePrivateJson(), getUsageLimits(), normalizeLimits() (+2 more)

### Community 12 - "Community 12"
Cohesion: 0.38
Nodes (3): aggregateRows(), monthLabel(), summarizeUsage()

### Community 13 - "Community 13"
Cohesion: 0.52
Nodes (6): decide(), decideCursor(), decideOllama(), estimateTokens(), labelForModel(), route()

### Community 15 - "Community 15"
Cohesion: 0.6
Nodes (3): onKeyDown(), selectSkill(), submit()

### Community 17 - "Community 17"
Cohesion: 0.7
Nodes (4): collectSkillFiles(), getSkills(), loadSkillsFrom(), parseFrontmatter()

## Ambiguous Edges - Review These
- `Relay` → `sessionboard`  [AMBIGUOUS]
  src/renderer/index.html · relation: conceptually_related_to

## Knowledge Gaps
- **7 isolated node(s):** `Mission Control for AI Coding Sessions`, `Cursor SDK`, `Token Usage Dashboard`, `Chat Modes`, `router.ts` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Relay` and `sessionboard`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `writePrivateJson()` connect `Community 10` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `Community 5`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `sendMessage()` connect `Community 0` to `Community 3`, `Community 4`, `Community 5`, `Community 9`, `Community 10`, `Community 13`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `route()` connect `Community 13` to `Community 0`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `sendMessage()` (e.g. with `isOpenAIConnected()` and `isGeminiConnected()`) actually correct?**
  _`sendMessage()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `writePrivateJson()` (e.g. with `writeConfig()` and `writeConfig()`) actually correct?**
  _`writePrivateJson()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Mission Control for AI Coding Sessions`, `Cursor SDK`, `Token Usage Dashboard` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._