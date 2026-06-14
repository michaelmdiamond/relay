# Skill Opportunity Report

Generated: 2026-05-22T22:31:38.145Z

## Corpus

- Sessions parsed: 83
- User prompts parsed: 1038
- Commands parsed: 2971
- Sources: codex 59, claude 20, relay 4
- Misc/unclassified sessions: 47

## Ranked Candidates

| Rank | Candidate skill | Sessions | Score | Evidence | First version |
|---:|---|---:|---:|---|---|
| 1 | Relay product development | 24 | 82 | top project: relay; top command: sed; top tool: exec_command | Start from repo state, inspect the relevant main/preload/renderer files, make scoped TypeScript changes, run typecheck/build, and summarize files touched plus verification. |
| 2 | GitHub sync, branch, and PR workflow | 22 | 78 | top project: relay; top command: sed; top tool: exec_command | Check status/remotes/branch, fetch, reconcile safely without discarding user changes, run project checks when code changed, then commit/push/open or update PR when requested. |
| 3 | Visual frontend implementation and QA | 6 | 50 | top project: relay; top command: sed; top tool: exec_command | Implement UI changes against existing design patterns, run the local app, verify with desktop/mobile screenshots, and fix visible overlap, blank states, and responsive issues. |
| 4 | Local system and app automation | 6 | 50 | top project: relay; top command: sed; top tool: exec_command | Inspect the local app/system state, prefer reversible settings or scripts, ask before externally visible actions, and document cleanup/reversal steps. |
| 5 | Conversation mining for workflow discovery | 5 | 48 | top project: relay; top command: sed; top tool: exec_command | Read Codex, Claude, and Relay histories; normalize sessions; classify intents and tool chains; produce ranked skill candidates with evidence and draft SKILL.md files. |
| 6 | Mobbin design research ingestion | 4 | 46 | top project: mobbin-library; top command: node; top tool: exec_command | Search Mobbin with query batches, ingest normalized screen records, verify database counts and Drive upload coverage, and report gaps or rate-limit state. |
| 7 | Local data analysis and reporting | 4 | 46 | top project: mobbin-library; top command: node; top tool: exec_command | Locate the local data source, write a reproducible parser or query, emit both machine-readable data and a concise Markdown report, and include caveats. |
| 8 | Skill authoring and rollout | 4 | 40 | top project: relay; top command: sed; top tool: exec_command | Convert repeated prompts into concise skill bodies with strong trigger descriptions, draft examples, and a small validation plan before installation. |

## Candidate Details

### Relay product development

- Draft skill: `docs/skill-opportunities/drafts/relay-product-dev/SKILL.md`
- Sessions: 24
- Score: 82
- Top projects: relay (18), michael (3), mobbin-library (2), 2026-04-29-read-this-conversation-and-prd-and (1)
- Top commands: sed (467), git (255), rg (193), npm (145), nl (60), node (37), cgc (30), gh (28), find (25), sqlite3 (23), ls (22), $(cat (15)
- Top tools: exec_command (1468), write_stdin (207), update_plan (49), get_app_state (12), view_image (11), click (10), js (4), search_screens (3), execute_cypher_query (2), list_apps (2), list_mcp_resources (2), request_user_input (2)

Representative prompts:
- 2026-05-22 22:22:38 [codex] How might we visualize how sub agents work relative to the main agent, while a terminal is working? I tried to use Gemini CLI and the moment it created sub agents the CLI became basically un-usable. How can we fix this in Relay?
- 2026-05-17 19:05:11 [codex] # Files mentioned by the user: ## Screenshot 2026-05-17 at 11.51.21 AM.png: /Users/michael/Desktop/Screenshot 2026-05-17 at 11.51.21 AM.png ## My request for Codex: I think the UI we're using right now is pretty weak to create new agents - let's learn from wha
- 2026-05-17 00:57:58 [codex] Project: ~/Documents/GitHub/mobbin-library — a TypeScript/SQLite cache for Mobbin UI screens with a Google Drive image sync. What's built: src/drive.ts handles OAuth + image upload to Drive. src/cli.ts has a drive-upload command that uploads images for screens
- 2026-05-17 00:05:20 [codex] The app can be pretty slow to type into this nested terminal - much slower than typing into an active terminal. Why is it different
- 2026-05-13 21:17:25 [codex] I accidentally opened a prior session in my home folder vs the relay repo - read in this context then report back

### GitHub sync, branch, and PR workflow

- Draft skill: `docs/skill-opportunities/drafts/github-sync-pr/SKILL.md`
- Sessions: 22
- Score: 78
- Top projects: relay (13), dynasty-hub (2), mobbin-library (2), 2026-04-29-read-this-conversation-and-prd-and (1), babydiamond (1), claude-voice (1), i-ve-been-using-claude-to (1), michael (1)
- Top commands: sed (379), git (298), rg (141), npm (133), cgc (46), node (31), curl (30), nl (29), gh (28), npx (24), ls (23), command (19)
- Top tools: exec_command (1362), write_stdin (171), update_plan (15), _list_folder (10), view_image (8), _search (4), js (4), _merge_pull_request (3), search_screens (3), _create_pull_request (2), execute_cypher_query (2), get_app_state (2)

Representative prompts:
- 2026-05-21 20:10:07 [codex] let's catch up to the latest on github, just in case
- 2026-05-18 03:50:43 [codex] Let's build a new feature around lineup improvement automation. I'd like to actually make lineup chanes to a roster with my site if the user fully connects their sleeper account. This is the evolution of what we did to accept and deny trades
- 2026-05-18 00:59:33 [codex] We made it so you have to be signed in to give feedback - can we undo that? Let anyone who's connected their sleeper account give feedback
- 2026-05-17 19:05:11 [codex] # Files mentioned by the user: ## Screenshot 2026-05-17 at 11.51.21 AM.png: /Users/michael/Desktop/Screenshot 2026-05-17 at 11.51.21 AM.png ## My request for Codex: I think the UI we're using right now is pretty weak to create new agents - let's learn from wha
- 2026-05-17 00:57:58 [codex] Project: ~/Documents/GitHub/mobbin-library — a TypeScript/SQLite cache for Mobbin UI screens with a Google Drive image sync. What's built: src/drive.ts handles OAuth + image upload to Drive. src/cli.ts has a drive-upload command that uploads images for screens

### Visual frontend implementation and QA

- Draft skill: `docs/skill-opportunities/drafts/visual-frontend-qa/SKILL.md`
- Sessions: 6
- Score: 50
- Top projects: relay (5), mobbin-library (1)
- Top commands: sed (138), rg (68), npm (63), git (62), nl (21), $(cat (15), gh (10), node (9), command (6), find (5), ls (5), cat (4)
- Top tools: exec_command (437), write_stdin (50), update_plan (19), view_image (9), js (4), execute_cypher_query (2), request_user_input (2), wait_agent (2), close_agent (1), discover_codegraph_contexts (1), spawn_agent (1), switch_context (1)

Representative prompts:
- 2026-05-17 19:05:11 [codex] # Files mentioned by the user: ## Screenshot 2026-05-17 at 11.51.21 AM.png: /Users/michael/Desktop/Screenshot 2026-05-17 at 11.51.21 AM.png ## My request for Codex: I think the UI we're using right now is pretty weak to create new agents - let's learn from wha
- 2026-05-12 04:03:05 [codex] The content of the sidebar should never change based on the selected tab - the info should be the same between them. That means the board is going to have duplicate information. We'll solve this by cleaning up the project view.
- 2026-05-07 20:55:18 [codex] Someone else had a similar idea, which makes sense since it's a developer tool with no moat. I was never going to sell this, it's purely open source if it helps anyone https://www.reddit.com/r/ClaudeCode/comments/1t4xayc/i_built_tessera_a_gui_command_center_fo
- 2026-05-05 23:25:56 [codex] I'm seeing that Claude lets you access different models now - at least, deepseek and ollama for instance. Are we SURE I'm solving a real problem here with Relay?
- 2026-05-22T04:36:03.939Z [claude] • Handoff instructions for Claude/Gemini: Project: /Users/michael/Documents/GitHub/mobbin-library Goal: Continue pulling popular iOS app screens from Mobbin, ingesting them into SQLite, and uploading images immediately to Google Drive. Current status: - Main D

### Local system and app automation

- Draft skill: `docs/skill-opportunities/drafts/local-system-automation/SKILL.md`
- Sessions: 6
- Score: 50
- Top projects: relay (4), 2026-04-29-read-this-conversation-and-prd-and (1), mobbin-library (1)
- Top commands: sed (117), rg (55), npm (53), git (40), nl (18), $(cat (15), node (9), find (5), ls (5), gh (4), deepseek (3), command (2)
- Top tools: exec_command (340), write_stdin (37), update_plan (19), request_user_input (2), wait_agent (2), close_agent (1), spawn_agent (1), switch_context (1), view_image (1)

Representative prompts:
- 2026-05-12 04:03:05 [codex] The content of the sidebar should never change based on the selected tab - the info should be the same between them. That means the board is going to have duplicate information. We'll solve this by cleaning up the project view.
- 2026-05-07 20:55:18 [codex] Someone else had a similar idea, which makes sense since it's a developer tool with no moat. I was never going to sell this, it's purely open source if it helps anyone https://www.reddit.com/r/ClaudeCode/comments/1t4xayc/i_built_tessera_a_gui_command_center_fo
- 2026-05-05 23:25:56 [codex] I'm seeing that Claude lets you access different models now - at least, deepseek and ollama for instance. Are we SURE I'm solving a real problem here with Relay?
- 2026-04-29 22:58:57 [codex] Read this conversation and PRD and give me feedback on it I have a ton of substack articles I mean to read but never do. I much prefer to listen to my content. Is there any way to turn these articles into podcasts? I'm willing to build this out myself. I also
- 2026-05-22T04:36:03.939Z [claude] • Handoff instructions for Claude/Gemini: Project: /Users/michael/Documents/GitHub/mobbin-library Goal: Continue pulling popular iOS app screens from Mobbin, ingesting them into SQLite, and uploading images immediately to Google Drive. Current status: - Main D

### Conversation mining for workflow discovery

- Draft skill: `docs/skill-opportunities/drafts/conversation-mining/SKILL.md`
- Sessions: 5
- Score: 48
- Top projects: relay (5)
- Top commands: sed (94), npm (36), rg (34), git (25), node (16), $(cat (15), nl (6), find (5), ls (4), deepseek (3), command (2), cp (2)
- Top tools: exec_command (256), write_stdin (28), update_plan (8), request_user_input (2), wait_agent (2), close_agent (1), spawn_agent (1)

Representative prompts:
- 2026-05-22 22:31:37 [codex] I'm realizing that I still don't use any skills. I just prompt. I'm curious if I have workflows that I repeat that I'm not aware that I'm repeating. As part of relay I've been capturing agent conversations everywhere so we should have a good amount of data. Ho
- 2026-05-07 20:55:18 [codex] Someone else had a similar idea, which makes sense since it's a developer tool with no moat. I was never going to sell this, it's purely open source if it helps anyone https://www.reddit.com/r/ClaudeCode/comments/1t4xayc/i_built_tessera_a_gui_command_center_fo
- 2026-05-05 23:25:56 [codex] I'm seeing that Claude lets you access different models now - at least, deepseek and ollama for instance. Are we SURE I'm solving a real problem here with Relay?
- 2026-04-29T22:16:31.034Z [claude] what's the control to load relay? npm electron or something
- 2026-05-16T23:27:45.111Z [claude] <local-command-caveat>Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages or otherwise consider them in your response unless the user explicitly asks you to.</local-command-caveat>

### Mobbin design research ingestion

- Draft skill: `docs/skill-opportunities/drafts/mobbin-design-research/SKILL.md`
- Sessions: 4
- Score: 46
- Top projects: mobbin-library (3), relay (1)
- Top commands: node (18), git (12), npx (12), sed (12), rg (7), ls (6), npm (6), curl (5), find (5), cat (3), codex (3), queries=( (3)
- Top tools: exec_command (101), write_stdin (62), search_screens (3)

Representative prompts:
- 2026-05-17 00:57:58 [codex] Project: ~/Documents/GitHub/mobbin-library — a TypeScript/SQLite cache for Mobbin UI screens with a Google Drive image sync. What's built: src/drive.ts handles OAuth + image upload to Drive. src/cli.ts has a drive-upload command that uploads images for screens
- 2026-05-16 22:05:35 [codex] Project: ~/Documents/GitHub/mobbin-library — a TypeScript/SQLite cache for Mobbin UI screens with a Google Drive image sync. What's built: src/drive.ts handles OAuth + image upload to Drive. src/cli.ts has a drive-upload command that uploads images for screens
- 2026-05-22T04:36:03.939Z [claude] • Handoff instructions for Claude/Gemini: Project: /Users/michael/Documents/GitHub/mobbin-library Goal: Continue pulling popular iOS app screens from Mobbin, ingesting them into SQLite, and uploading images immediately to Google Drive. Current status: - Main D
- 2026-05-16T23:27:45.111Z [claude] <local-command-caveat>Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages or otherwise consider them in your response unless the user explicitly asks you to.</local-command-caveat>

### Local data analysis and reporting

- Draft skill: `docs/skill-opportunities/drafts/local-data-reporting/SKILL.md`
- Sessions: 4
- Score: 46
- Top projects: mobbin-library (2), relay (2)
- Top commands: node (17), sed (17), $(cat (15), git (11), npx (11), find (9), ls (6), rg (6), curl (5), npm (5), codex (3), queries=( (3)
- Top tools: exec_command (127), write_stdin (62), search_screens (3), wait_agent (2), close_agent (1), spawn_agent (1)

Representative prompts:
- 2026-05-17 00:57:58 [codex] Project: ~/Documents/GitHub/mobbin-library — a TypeScript/SQLite cache for Mobbin UI screens with a Google Drive image sync. What's built: src/drive.ts handles OAuth + image upload to Drive. src/cli.ts has a drive-upload command that uploads images for screens
- 2026-05-05 23:25:56 [codex] I'm seeing that Claude lets you access different models now - at least, deepseek and ollama for instance. Are we SURE I'm solving a real problem here with Relay?
- 2026-05-22T04:36:03.939Z [claude] • Handoff instructions for Claude/Gemini: Project: /Users/michael/Documents/GitHub/mobbin-library Goal: Continue pulling popular iOS app screens from Mobbin, ingesting them into SQLite, and uploading images immediately to Google Drive. Current status: - Main D
- 2026-05-16T23:27:45.111Z [claude] <local-command-caveat>Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages or otherwise consider them in your response unless the user explicitly asks you to.</local-command-caveat>

### Skill authoring and rollout

- Draft skill: `docs/skill-opportunities/drafts/personal-skill-authoring/SKILL.md`
- Sessions: 4
- Score: 40
- Top projects: relay (3), mobbin-library (1)
- Top commands: sed (24), $(cat (15), rg (10), node (7), find (4), cp (2), git (2), graphify (2), mkdir (2), sqlite3 (2), ls (1), pwd (1)
- Top tools: exec_command (75), wait_agent (2), close_agent (1), spawn_agent (1)

Representative prompts:
- 2026-05-22 22:31:37 [codex] I'm realizing that I still don't use any skills. I just prompt. I'm curious if I have workflows that I repeat that I'm not aware that I'm repeating. As part of relay I've been capturing agent conversations everywhere so we should have a good amount of data. Ho
- 2026-05-05 23:25:56 [codex] I'm seeing that Claude lets you access different models now - at least, deepseek and ollama for instance. Are we SURE I'm solving a real problem here with Relay?
- 2026-05-22T04:36:03.939Z [claude] • Handoff instructions for Claude/Gemini: Project: /Users/michael/Documents/GitHub/mobbin-library Goal: Continue pulling popular iOS app screens from Mobbin, ingesting them into SQLite, and uploading images immediately to Google Drive. Current status: - Main D
- 2026-04-29T22:16:31.034Z [claude] what's the control to load relay? npm electron or something

## Interpretation

The strongest candidates are the workflows with repeated prompts plus repeated command/tool chains. A low-count cluster can still be valuable when it is procedural and expensive, but the first install candidates should be high-count and high-score.

Recommended first experiment: install or manually invoke the top three draft skills for the next matching task, then compare prompt length, corrections, verification quality, and whether the skill actually triggers at the right time.
