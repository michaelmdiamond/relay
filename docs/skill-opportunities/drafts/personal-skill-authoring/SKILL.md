---
name: personal-skill-authoring
description: Use when the user asks for skill authoring and rollout or gives a prompt that matches the repeated workflow evidence from Relay conversation history. This skill is a first draft generated from local Codex, Claude, and Relay transcripts; refine after two or three real uses.
---

# Skill authoring and rollout

## Workflow

1. Restate the concrete task and identify the active project. Common projects from history: relay, michael, dynasty-hub, mobbin-library.
2. Gather local context before changing anything. Prefer targeted searches and existing project scripts.
3. Follow the stable first-pass procedure: Convert repeated prompts into concise skill bodies with strong trigger descriptions, draft examples, and a small validation plan before installation.
4. Preserve user changes. Do not discard unrelated dirty work.
5. Verify with the smallest check that proves the requested behavior. Common command/tool signals from history: sed, git, rg, npm, nl, cgc.
6. Finish with changed files, verification performed, residual risks, and a concrete next step only when useful.

## Evidence To Preserve

- Observed sessions: 62
- Skill score: 158
- Representative prompts:
  - I'm realizing that I still don't use any skills. I just prompt. I'm curious if I have workflows that I repeat that I'm not aware that I'm repeating. As part of relay I've been capturing agent conversations everywhere so we should have a good amount of data. Ho
  - How might we visualize how sub agents work relative to the main agent, while a terminal is working? I tried to use Gemini CLI and the moment it created sub agents the CLI became basically un-usable. How can we fix this in Relay?
  - I want to full screen a video within a portion of my screen without the full screen genuinely taking up the full screen. However when a video is scaled to the quadrant and not full screen it looks tiny and terrible
  - let's catch up to the latest on github, just in case

## Refinement Notes

After using this skill, update it with exact project conventions, expected output shape, recurring checks, and known failure modes. Keep this file concise; move long examples or schemas into references only if they are repeatedly needed.
