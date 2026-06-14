---
name: relay-product-dev
description: Use when the user asks for relay product development or gives a prompt that matches the repeated workflow evidence from Relay conversation history. This skill is a first draft generated from local Codex, Claude, and Relay transcripts; refine after two or three real uses.
---

# Relay product development

## Workflow

1. Restate the concrete task and identify the active project. Common projects from history: relay, michael, mobbin-library, 2026-04-29-read-this-conversation-and-prd-and.
2. Gather local context before changing anything. Prefer targeted searches and existing project scripts.
3. Follow the stable first-pass procedure: Start from repo state, inspect the relevant main/preload/renderer files, make scoped TypeScript changes, run typecheck/build, and summarize files touched plus verification.
4. Preserve user changes. Do not discard unrelated dirty work.
5. Verify with the smallest check that proves the requested behavior. Common command/tool signals from history: sed, git, rg, npm, nl, node.
6. Finish with changed files, verification performed, residual risks, and a concrete next step only when useful.

## Evidence To Preserve

- Observed sessions: 24
- Skill score: 82
- Representative prompts:
  - How might we visualize how sub agents work relative to the main agent, while a terminal is working? I tried to use Gemini CLI and the moment it created sub agents the CLI became basically un-usable. How can we fix this in Relay?
  - # Files mentioned by the user: ## Screenshot 2026-05-17 at 11.51.21 AM.png: /Users/michael/Desktop/Screenshot 2026-05-17 at 11.51.21 AM.png ## My request for Codex: I think the UI we're using right now is pretty weak to create new agents - let's learn from wha
  - Project: ~/Documents/GitHub/mobbin-library — a TypeScript/SQLite cache for Mobbin UI screens with a Google Drive image sync. What's built: src/drive.ts handles OAuth + image upload to Drive. src/cli.ts has a drive-upload command that uploads images for screens
  - The app can be pretty slow to type into this nested terminal - much slower than typing into an active terminal. Why is it different

## Refinement Notes

After using this skill, update it with exact project conventions, expected output shape, recurring checks, and known failure modes. Keep this file concise; move long examples or schemas into references only if they are repeatedly needed.
