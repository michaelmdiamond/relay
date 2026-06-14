---
name: visual-frontend-qa
description: Use when the user asks for visual frontend implementation and qa or gives a prompt that matches the repeated workflow evidence from Relay conversation history. This skill is a first draft generated from local Codex, Claude, and Relay transcripts; refine after two or three real uses.
---

# Visual frontend implementation and QA

## Workflow

1. Restate the concrete task and identify the active project. Common projects from history: relay, mobbin-library.
2. Gather local context before changing anything. Prefer targeted searches and existing project scripts.
3. Follow the stable first-pass procedure: Implement UI changes against existing design patterns, run the local app, verify with desktop/mobile screenshots, and fix visible overlap, blank states, and responsive issues.
4. Preserve user changes. Do not discard unrelated dirty work.
5. Verify with the smallest check that proves the requested behavior. Common command/tool signals from history: sed, rg, npm, git, nl, $(cat.
6. Finish with changed files, verification performed, residual risks, and a concrete next step only when useful.

## Evidence To Preserve

- Observed sessions: 6
- Skill score: 50
- Representative prompts:
  - # Files mentioned by the user: ## Screenshot 2026-05-17 at 11.51.21 AM.png: /Users/michael/Desktop/Screenshot 2026-05-17 at 11.51.21 AM.png ## My request for Codex: I think the UI we're using right now is pretty weak to create new agents - let's learn from wha
  - The content of the sidebar should never change based on the selected tab - the info should be the same between them. That means the board is going to have duplicate information. We'll solve this by cleaning up the project view.
  - Someone else had a similar idea, which makes sense since it's a developer tool with no moat. I was never going to sell this, it's purely open source if it helps anyone https://www.reddit.com/r/ClaudeCode/comments/1t4xayc/i_built_tessera_a_gui_command_center_fo
  - I'm seeing that Claude lets you access different models now - at least, deepseek and ollama for instance. Are we SURE I'm solving a real problem here with Relay?

## Refinement Notes

After using this skill, update it with exact project conventions, expected output shape, recurring checks, and known failure modes. Keep this file concise; move long examples or schemas into references only if they are repeatedly needed.
