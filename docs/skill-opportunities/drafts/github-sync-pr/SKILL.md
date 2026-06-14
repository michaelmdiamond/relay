---
name: github-sync-pr
description: Use when the user asks for github sync, branch, and pr workflow or gives a prompt that matches the repeated workflow evidence from Relay conversation history. This skill is a first draft generated from local Codex, Claude, and Relay transcripts; refine after two or three real uses.
---

# GitHub sync, branch, and PR workflow

## Workflow

1. Restate the concrete task and identify the active project. Common projects from history: relay, dynasty-hub, mobbin-library, 2026-04-29-read-this-conversation-and-prd-and.
2. Gather local context before changing anything. Prefer targeted searches and existing project scripts.
3. Follow the stable first-pass procedure: Check status/remotes/branch, fetch, reconcile safely without discarding user changes, run project checks when code changed, then commit/push/open or update PR when requested.
4. Preserve user changes. Do not discard unrelated dirty work.
5. Verify with the smallest check that proves the requested behavior. Common command/tool signals from history: sed, git, rg, npm, cgc, node.
6. Finish with changed files, verification performed, residual risks, and a concrete next step only when useful.

## Evidence To Preserve

- Observed sessions: 22
- Skill score: 78
- Representative prompts:
  - let's catch up to the latest on github, just in case
  - Let's build a new feature around lineup improvement automation. I'd like to actually make lineup chanes to a roster with my site if the user fully connects their sleeper account. This is the evolution of what we did to accept and deny trades
  - We made it so you have to be signed in to give feedback - can we undo that? Let anyone who's connected their sleeper account give feedback
  - # Files mentioned by the user: ## Screenshot 2026-05-17 at 11.51.21 AM.png: /Users/michael/Desktop/Screenshot 2026-05-17 at 11.51.21 AM.png ## My request for Codex: I think the UI we're using right now is pretty weak to create new agents - let's learn from wha

## Refinement Notes

After using this skill, update it with exact project conventions, expected output shape, recurring checks, and known failure modes. Keep this file concise; move long examples or schemas into references only if they are repeatedly needed.
