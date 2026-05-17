# Claude Instructions

## Shell Search

- Use `rg` for text search any time `grep` would plausibly be used.
- Use `rg --files` for file discovery any time `find`, `ls -R`, or `grep` over filenames would plausibly be used.
- Only fall back to `grep` or `find` when `rg` is unavailable or when a command specifically requires POSIX `grep`/`find` semantics.
- Prefer targeted searches with `rg -n`, globs, and path filters before opening broad file ranges.
- Do not search generated or dependency directories unless the task explicitly requires it.

## Code Graph Search

- When CodeGraphContext MCP tools are available, prefer them for structural code questions: definitions, callers, callees, call chains, imports, class/interface hierarchy, impact analysis, dead code, and complexity.
- Use `rg` for exact text, filenames, literals, config keys, error messages, and other lexical searches.
- If CodeGraphContext MCP tools are unavailable, use the local `cgc` CLI for structural queries before broad file reads.
- Keep CodeGraphContext queries serial when using the embedded KuzuDB backend.

## Mobbin Library Cache

A local SQLite cache of Mobbin UI screens lives at `~/Documents/GitHub/mobbin-library/`.

**Before calling `mcp__mobbin__search_screens`**, check whether the query has already been cached:
```bash
cd ~/Documents/GitHub/mobbin-library && npx ts-node src/cli.ts by-query "<query>" --platform <ios|web>
```
If results are returned, use them instead of hitting the MCP tool.

**After calling `mcp__mobbin__search_screens`**, write each result to the cache via stdin ingest:
```bash
echo '<json-array-of-UpsertScreenInput>' | cd ~/Documents/GitHub/mobbin-library && npx ts-node src/cli.ts ingest
```
Each item must match `UpsertScreenInput` from `src/types.ts`: `{ id, appName, platform, imageUrl, mobbinUrl, query, rawResponse, imageData? }`.

**To add tags or notes** to a cached screen:
```bash
cd ~/Documents/GitHub/mobbin-library && npx ts-node src/cli.ts tag <screen-id> <tag1> <tag2>
cd ~/Documents/GitHub/mobbin-library && npx ts-node src/cli.ts note <screen-id> "note text"
```

**To browse the library:**
```bash
cd ~/Documents/GitHub/mobbin-library && npx ts-node src/cli.ts stats
cd ~/Documents/GitHub/mobbin-library && npx ts-node src/cli.ts search --query "checkout" --platform ios
```
