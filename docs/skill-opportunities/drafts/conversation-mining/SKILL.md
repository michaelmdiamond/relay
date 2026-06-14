---
name: conversation-mining
description: Use when the user asks for conversation mining for workflow discovery or gives a prompt that matches the repeated workflow evidence from Relay conversation history. This skill is a first draft generated from local Codex, Claude, and Relay transcripts; refine after two or three real uses.
---

# Conversation mining for workflow discovery

## Workflow

1. Restate the concrete task and identify the active project. Common projects from history: relay.
2. Gather local context before changing anything. Prefer targeted searches and existing project scripts.
3. Follow the stable first-pass procedure: Read Codex, Claude, and Relay histories; normalize sessions; classify intents and tool chains; produce ranked skill candidates with evidence and draft SKILL.md files.
4. Preserve user changes. Do not discard unrelated dirty work.
5. Verify with the smallest check that proves the requested behavior. Common command/tool signals from history: sed, npm, rg, git, node, $(cat.
6. Finish with changed files, verification performed, residual risks, and a concrete next step only when useful.

## Evidence To Preserve

- Observed sessions: 5
- Skill score: 48
- Representative prompts:
  - I'm realizing that I still don't use any skills. I just prompt. I'm curious if I have workflows that I repeat that I'm not aware that I'm repeating. As part of relay I've been capturing agent conversations everywhere so we should have a good amount of data. Ho
  - Someone else had a similar idea, which makes sense since it's a developer tool with no moat. I was never going to sell this, it's purely open source if it helps anyone https://www.reddit.com/r/ClaudeCode/comments/1t4xayc/i_built_tessera_a_gui_command_center_fo
  - I'm seeing that Claude lets you access different models now - at least, deepseek and ollama for instance. Are we SURE I'm solving a real problem here with Relay?
  - what's the control to load relay? npm electron or something

## Refinement Notes

After using this skill, update it with exact project conventions, expected output shape, recurring checks, and known failure modes. Keep this file concise; move long examples or schemas into references only if they are repeatedly needed.
