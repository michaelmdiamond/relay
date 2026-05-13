#!/usr/bin/env python3
"""Block Claude Code Bash calls that use grep where rg should be preferred."""

import json
import os
import re
import shlex
import sys


GREP_NAMES = {"grep", "egrep", "fgrep"}
COMMAND_SEPARATORS = {"|", "||", "&&", ";", "&", "(", ")"}
COMMAND_WRAPPERS = {"command", "builtin", "env", "noglob", "time"}
ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=.*$")


def tokenize(command: str) -> list[str]:
    lexer = shlex.shlex(command, posix=True, punctuation_chars="|&;()")
    lexer.whitespace_split = True
    lexer.commenters = ""
    return list(lexer)


def is_grep_command(token: str) -> bool:
    return os.path.basename(token) in GREP_NAMES


def command_uses_grep(command: str) -> bool:
    try:
        tokens = tokenize(command)
    except ValueError:
        return any(part in command for part in (" grep ", "\ngrep ", "|grep "))

    expecting_command = True
    after_xargs = False
    after_find_exec = False

    for token in tokens:
        if token in COMMAND_SEPARATORS:
            expecting_command = True
            after_xargs = False
            after_find_exec = False
            continue

        if after_find_exec and is_grep_command(token):
            return True

        if after_xargs and is_grep_command(token):
            return True

        if token == "-exec":
            after_find_exec = True
            continue

        if expecting_command:
            if ASSIGNMENT.match(token) or token in COMMAND_WRAPPERS:
                continue
            if is_grep_command(token):
                return True
            after_xargs = os.path.basename(token) == "xargs"
            expecting_command = False

    return False


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    command = payload.get("tool_input", {}).get("command", "")
    if isinstance(command, str) and "ALLOW_GREP=1" in command:
        return 0
    if not isinstance(command, str) or not command_uses_grep(command):
        return 0

    print(
        "Blocked: use ripgrep (`rg`) instead of grep for repo search.\n"
        "Try `rg -n \"pattern\" [path]` for text search or `rg --files` for file discovery.\n"
        "If POSIX grep is truly required, rerun with a short explanation and `ALLOW_GREP=1`.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
