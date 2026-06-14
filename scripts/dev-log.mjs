#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);

function usage(exitCode = 0) {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`Usage: npm run dev-log -- "what you actually did" [options]

Options:
  --date YYYY-MM-DD   Write an entry for a specific date.
  --branch NAME       Branch name to create when --pr runs from main/master.
  --commit            Commit the log file after writing it.
  --pr                Push the current branch and open a GitHub PR with gh.
  --help              Show this help text.

Examples:
  npm run dev-log -- "Reviewed stale cache issue and sketched a fix"
  npm run dev-log -- "Read Vite preload docs" --commit
  npm run dev-log -- "Tested OAuth callback behavior" --commit --pr
`);
  process.exit(exitCode);
}

function todayLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

let date = todayLocal();
let branchName = "";
let commit = false;
let pr = false;
const notes = [];

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];

  if (arg === "--help" || arg === "-h") {
    usage(0);
  } else if (arg === "--date") {
    const value = args[i + 1];
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      console.error("--date requires a YYYY-MM-DD value.");
      usage(1);
    }
    date = value;
    i += 1;
  } else if (arg === "--branch") {
    const value = args[i + 1];
    if (!value) {
      console.error("--branch requires a branch name.");
      usage(1);
    }
    branchName = value;
    i += 1;
  } else if (arg === "--commit") {
    commit = true;
  } else if (arg === "--pr") {
    pr = true;
    commit = true;
  } else if (arg.startsWith("--")) {
    console.error(`Unknown option: ${arg}`);
    usage(1);
  } else {
    notes.push(arg);
  }
}

const note = notes.join(" ").trim();

if (!note) {
  console.error("Add a short note about real work, learning, review, or planning.");
  usage(1);
}

if (pr) {
  const currentBranch = execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  }).trim();

  if (!currentBranch) {
    console.error("Cannot open a PR from a detached HEAD.");
    process.exit(1);
  }

  if (["main", "master"].includes(currentBranch)) {
    const suffix = new Date().toISOString().replace(/[:.]/g, "-");
    const nextBranch = branchName || `dev-log/${date}-${suffix}`;
    run("git", ["switch", "-c", nextBranch]);
  }
}

const [year, month] = date.split("-");
const filePath = join("docs", "dev-log", year, month, `${date}.md`);
const absoluteDir = dirname(filePath);
mkdirSync(absoluteDir, { recursive: true });

const line = `- ${note}\n`;

if (existsSync(filePath)) {
  const existing = readFileSync(filePath, "utf8");
  const next = existing.endsWith("\n") ? `${existing}${line}` : `${existing}\n${line}`;
  writeFileSync(filePath, next);
} else {
  writeFileSync(filePath, `# ${date}\n\n${line}`);
}

console.log(`Updated ${filePath}`);

if (commit) {
  run("git", ["add", filePath]);
  run("git", ["commit", "-m", `Add dev log for ${date}`]);
}

if (pr) {
  const branch = execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  }).trim();

  run("git", ["push", "-u", "origin", branch]);
  run("gh", [
    "pr",
    "create",
    "--title",
    `Add dev log for ${date}`,
    "--body",
    `Daily dev log entry for ${date}.\n\nThis records real development work, learning, review, or planning.`,
  ]);
}
