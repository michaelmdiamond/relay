# Relay

**Mission control for AI coding sessions.**

Relay is a macOS desktop app that gives you a single interface for every AI model you already pay for — Claude, OpenAI Codex, Google Gemini, local Ollama models, and Cursor — without handing your conversations to a third-party aggregator.

---

## Why

Switching between Claude.ai, ChatGPT, Gemini, and Cursor to pick the right model for a task is tedious. Existing multi-model tools either require their own subscriptions or proxy everything through their own backend. Relay runs on your machine, talks directly to each provider using your own credentials, and never touches your conversations.

---

## Features

### Multi-provider routing
Relay supports five provider families out of the box:

| Provider | Models | Auth |
|---|---|---|
| **Anthropic** | Haiku, Sonnet, Opus | API key |
| **OpenAI Codex** | gpt-5.x series | OAuth, API key
| **Google Gemini** | 2.5 Pro, Flash, Flash-Lite | Oauth, API key |
| **Ollama** | Any local model | Auto-start, no key needed |
| **Cursor SDK** | Composer + others | Oauth, API key |

### Smart auto-routing
In `auto` mode, Relay picks the right model for each message:

1. **Local first** — simple queries go to Ollama if it's running (saves cloud tokens)
2. **Free providers** — code tasks route to Codex, general tasks to Gemini, when you're logged in
3. **Anthropic by context size** — Haiku for short replies, Sonnet for moderate work, Opus for large context or complex code

You can always override and pin a specific provider.

### Conversation memory
Each conversation accumulates a lightweight memory: active goal, pinned facts, key decisions, files touched. At 14+ messages Relay auto-summarizes the history so you keep coherent multi-turn context without burning tokens on stale messages.

### In-app terminals
Launch `claude` or `codex` CLI sessions in a PTY tab inside the app. Terminal sessions sit alongside chat so you can reference the same conversation context without context-switching windows.

### Token usage dashboard
Tracks input/output/cached tokens per model across all providers in one dashboard. Useful for understanding where your quota actually goes.

### Conversation import
Relay reads your existing conversation history from:
- **Claude** — `~/.claude/projects/*/sessionId.jsonl`
- **Codex** — `~/.codex/state_5.sqlite`

Imported conversations are read-only and preserve the original model/token metadata.

### Chat modes
Six prompt modes tune how the model approaches a message: `quick`, `deep`, `code`, `review`, `brainstorm`, `compare`.

---

## Getting started

### Prerequisites
- macOS (Apple Silicon or Intel)
- Node.js 20+
- At least one provider credential (see below)

### Install & run

```bash
git clone https://github.com/michaelmdiamond/relay.git
cd relay
npm install
npm run dev       # starts main + renderer in watch mode
npm run electron  # launches the Electron app
```

### Connecting providers

Open the **Connections** tab in the app and add whichever providers you use:

- **Anthropic** — paste your API key from console.anthropic.com
- **OpenAI Codex** — click "Connect" to OAuth through your ChatGPT account
- **Gemini** — paste your API key from aistudio.google.com (starts with `AIza`)
- **Ollama** — enter your base URL (default `http://localhost:11434`); Relay auto-starts Ollama on launch
- **Cursor** — paste your Cursor API key; Relay validates and stores your user metadata

Credentials are stored locally in your app data directory and never leave your machine.

---

## Architecture

```
Renderer (React + Zustand)
  └── IPC Bridge (preload)
        └── Main process (Node.js)
              ├── router.ts        — provider/model selection
              ├── chat.ts          — message dispatch & streaming
              ├── connectors.ts    — connected-tool inventory
              ├── openai-codex.ts  — Codex streaming
              ├── gemini.ts        — Gemini streaming
              ├── ollama.ts        — Ollama streaming
              ├── cursor-agent.ts  — Cursor SDK agent
              └── index.ts         — IPC handlers, PTY management
```

All providers implement the same streaming pattern — `stream*Message()` emits `chat-chunk` IPC events that the renderer assembles in real time. Adding a new provider is a clean, repeatable recipe.

Conversations persist locally at `~/.config/Relay/conversations.json`.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Watch mode for main + renderer |
| `npm run build` | Production build |
| `npm run electron` | Launch built app |

---

## Status

Early-stage personal project. Works well for daily use; APIs and data formats may change between commits.
