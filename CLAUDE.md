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
