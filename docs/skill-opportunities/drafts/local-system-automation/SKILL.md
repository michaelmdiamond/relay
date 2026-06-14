---
name: local-system-automation
description: Use when the user asks for local system and app automation or gives a prompt that matches the repeated workflow evidence from Relay conversation history. This skill is a first draft generated from local Codex, Claude, and Relay transcripts; refine after two or three real uses.
---

# Local system and app automation

## Workflow

1. Restate the concrete task and identify the active project. Common projects from history: relay, 2026-04-29-read-this-conversation-and-prd-and, mobbin-library.
2. Gather local context before changing anything. Prefer targeted searches and existing project scripts.
3. Follow the stable first-pass procedure: Inspect the local app/system state, prefer reversible settings or scripts, ask before externally visible actions, and document cleanup/reversal steps.
4. Preserve user changes. Do not discard unrelated dirty work.
5. Verify with the smallest check that proves the requested behavior. Common command/tool signals from history: sed, rg, npm, git, nl, $(cat.
6. Finish with changed files, verification performed, residual risks, and a concrete next step only when useful.

## Evidence To Preserve

- Observed sessions: 6
- Skill score: 50
- Representative prompts:
  - The content of the sidebar should never change based on the selected tab - the info should be the same between them. That means the board is going to have duplicate information. We'll solve this by cleaning up the project view.
  - Someone else had a similar idea, which makes sense since it's a developer tool with no moat. I was never going to sell this, it's purely open source if it helps anyone https://www.reddit.com/r/ClaudeCode/comments/1t4xayc/i_built_tessera_a_gui_command_center_fo
  - I'm seeing that Claude lets you access different models now - at least, deepseek and ollama for instance. Are we SURE I'm solving a real problem here with Relay?
  - Read this conversation and PRD and give me feedback on it I have a ton of substack articles I mean to read but never do. I much prefer to listen to my content. Is there any way to turn these articles into podcasts? I'm willing to build this out myself. I also

## Refinement Notes

After using this skill, update it with exact project conventions, expected output shape, recurring checks, and known failure modes. Keep this file concise; move long examples or schemas into references only if they are repeatedly needed.
