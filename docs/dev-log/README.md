# Dev Log

Small daily notes go here so useful work does not disappear just because it was review, reading, debugging, planning, or a small fix.

Create or append today's entry:

```sh
npm run dev-log -- "Reviewed stale cache issue and sketched a fix"
```

Create an entry for a specific date:

```sh
npm run dev-log -- "Tested OAuth callback behavior" --date 2026-05-20
```

Commit the entry:

```sh
npm run dev-log -- "Read Vite preload docs" --commit
```

Open a PR from the current branch:

```sh
npm run dev-log -- "Triage renderer startup error" --commit --pr
```

When `--pr` runs from `main` or `master`, the script creates a dated `dev-log/...` branch first. Pass `--branch my-branch-name` to choose the branch name.

Keep entries short and factual. Good entries include code review, debugging notes, docs read, design decisions, test runs, issue triage, and implementation work.

## Daily reminder

The `Dev Log Reminder` workflow runs every day at 14:00 UTC and opens one reminder issue if there is not already an open reminder for that date. From there, add a real one-line note through `Actions -> Dev Log PR -> Run workflow`.
