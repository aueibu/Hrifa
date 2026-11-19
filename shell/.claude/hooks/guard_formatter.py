#!/usr/bin/env python3
"""PreToolUse guard (Bash and PowerShell): block formatter and auto-fix runs that write files.

Why: `oxfmt` writes in place by default and formats the whole project when it is given no path, and
`format:write` covers every file. On 2026-11-16 one such run rewrote 34 unrelated files during a builder run.

Blocks (exit code 2, message on stderr; the tool call does not run):
  - oxfmt without --check and without --stdin-filepath (--help / --version are fine)
  - format:write (a yarn / npm script)
  - stylelint or oxlint with any --fix flag
  - prettier with --write or -w
Allows everything else, for example `oxfmt -c oxfmt.config.mjs --check src/a.ts`, `oxfmt --stdin-filepath a.ts`,
`corepack yarn check:hfl`, `git status`.

Only the program a command actually runs is looked at, so `git commit -m "oxfmt --write"` or
`grep format:write package.json` are not blocked.

ALLOW_EXPLICIT_FILES = True also allows `oxfmt [--write] <explicit files>`: every positional argument must be a
plain file path with an extension, no glob characters, and not a directory (it is checked against the real
folder when it exists). A run with no path, a directory, `.` or a glob is still blocked: that is how the
2026-11-16 incident happened. Set it to False to require --check or --stdin-filepath for every oxfmt run.

A crash in this script exits non-zero but not 2, which Claude Code treats as "hook error, carry on": it never
blocks ordinary work by accident.
"""
import json
import os
import re
import sys

ALLOW_EXPLICIT_FILES = True  # human, 2026-11-16: formatting named files is fine; directories, globs and no path are not

# Words that only launch another program; skipped to find the program that really runs.
WRAPPERS = {
    "corepack", "yarn", "npx", "npm", "pnpm", "bunx", "run", "exec", "dlx", "node", "env", "call",
    "time", "cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "&", ".", "--yes", "-y",
    "--no-install", "/c", "/k", "-command", "-c",
}
ENV_ASSIGN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
TOKEN = re.compile(r"\"[^\"]*\"|'[^']*'|\S+")
SPLIT = re.compile(r"&&|\|\||;|\||\n|\r")  # naive splitter: only the fallback for an unbalanced quote
GLOB_CHARS = set("*?{}[]")
# Text that is data, not commands: bash heredoc bodies and PowerShell here-strings.
HEREDOC = re.compile(r"<<-?[ \t]*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n.*?\n[ \t]*\2[ \t]*(?=\n|$)", re.S)
PS_HERESTRING = re.compile(r"@(['\"])[ \t]*\r?\n.*?\r?\n\1@", re.S)


def strip_bodies(command):
    command = HEREDOC.sub(lambda m: m.group(0).split("\n", 1)[0], command)
    return PS_HERESTRING.sub("@''@", command)


def split_command(command):
    """Split on && || ; | and newlines, but not inside quotes (so a quoted `a; b` is one piece of text)."""
    segments, buf, quote, i, n = [], [], None, 0, len(command)
    while i < n:
        c = command[i]
        if quote:
            buf.append(c)
            if c == quote:
                quote = None
            i += 1
            continue
        if c in "'\"":
            quote = c
            buf.append(c)
            i += 1
            continue
        if command.startswith(("&&", "||"), i):
            segments.append("".join(buf))
            buf = []
            i += 2
            continue
        if c in ";|\n\r":
            segments.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(c)
        i += 1
    if quote is not None:  # unbalanced quote: stay safe and fall back to the naive split of the whole command
        return SPLIT.split(command)
    segments.append("".join(buf))
    return segments


def tokens_of(segment):
    out = []
    for t in TOKEN.findall(segment):
        if len(t) >= 2 and t[0] == t[-1] and t[0] in "\"'":
            t = t[1:-1]
        out.append(t)
    return out


def program_name(token):
    base = re.split(r"[\\/]", token)[-1].lower()
    for ext in (".cmd", ".exe", ".bat", ".ps1", ".mjs", ".cjs", ".js"):
        if base.endswith(ext):
            base = base[: -len(ext)]
    return base


def effective_program(tokens):
    """Index and name of the first token that is not a wrapper, an env assignment or a PowerShell $env: set."""
    for i, t in enumerate(tokens):
        low = t.lower()
        if low in WRAPPERS or ENV_ASSIGN.match(t) or low.startswith("$env:"):
            continue
        return i, t
    return None, None


REDIRECT = re.compile(r"^(?:\d+|\*|&)?(?:>>?|<)(\S*)$")  # 2>&1  *>&1  2>$null  >out.txt  2>/dev/null  >  <


def without_redirects(args):
    """Drop redirection tokens (and the target that follows a bare operator): they are not file arguments."""
    out, skip = [], False
    for a in args:
        if skip:
            skip = False
            continue
        m = REDIRECT.match(a)
        if m:
            skip = m.group(1) == ""
            continue
        out.append(a)
    return out


def explicit_files_only(args, cwd=""):
    args = without_redirects(args)
    positional = [a for a in args if not a.startswith("-")]
    # option values (the argument after -c / --config) are not positional paths
    skip = set()
    for i, a in enumerate(args):
        if a in ("-c", "--config") and i + 1 < len(args):
            skip.add(args[i + 1])
    positional = [a for a in positional if a not in skip]
    if not positional:
        return False
    for p in positional:
        if any(c in p for c in GLOB_CHARS) or p in (".", "..") or p.endswith(("/", "\\")):
            return False
        if not re.search(r"\.[A-Za-z0-9]+$", p):
            return False
        if cwd and os.path.isdir(os.path.join(cwd, p)):
            return False
    return True


def check_segment(segment, cwd=""):
    """Return a reason string when the segment must be blocked, else None."""
    toks = tokens_of(segment)
    # `bash -c "..."`, `powershell -Command "..."`, `cmd /c "..."`: look inside the quoted command text too.
    for i in range(len(toks) - 1):
        if toks[i].lower() in ("-c", "-command", "/c", "/k") and re.search(r"\s", toks[i + 1]):
            for sub in split_command(strip_bodies(toks[i + 1])):
                inner = check_segment(sub, cwd)
                if inner:
                    return inner
    idx, prog = effective_program(toks)
    if prog is None:
        return None
    name = program_name(prog)
    args = toks[idx + 1:]
    low_args = [a.lower() for a in args]

    if name == "format:write" or name.endswith(":write") and name.startswith("format"):
        return "`format:write` rewrites every file in the repo."
    if name == "oxfmt":
        if any(a in ("--help", "-h", "--version", "-v") for a in low_args):
            return None
        if "--check" in low_args or any(a.startswith("--stdin-filepath") for a in low_args):
            return None
        if ALLOW_EXPLICIT_FILES and explicit_files_only(args, cwd):
            return None
        return ("`oxfmt` writes files in place by default and formats the whole project when given no path, "
                "a directory or a glob. Name each file exactly (for example `oxfmt -c oxfmt.config.mjs src/a.ts`), "
                "or use `--check <files>` to test, or `--stdin-filepath <name>` to print formatted text.")
    if name in ("stylelint", "oxlint"):
        if any(a == "--fix" or a.startswith("--fix-") or a.startswith("--fix=") for a in low_args):
            return f"`{name} --fix` rewrites files."
        return None
    if name == "prettier":
        if "--write" in low_args or "-w" in low_args:
            return "`prettier --write` rewrites files."
        return None
    return None


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    if data.get("tool_name") not in ("Bash", "PowerShell"):
        return 0
    command = (data.get("tool_input") or {}).get("command") or ""
    cwd = data.get("cwd") or ""
    for segment in split_command(strip_bodies(command)):
        reason = check_segment(segment, cwd)
        if reason:
            sys.stderr.write(
                "Blocked by guard_formatter.py (.claude/hooks): " + reason + "\n"
                "Rule (human, 2026-11-16): no formatter or auto-fix may write over the repo. "
                "Allowed: `oxfmt -c oxfmt.config.mjs <exact files>` or `--check <exact files>`. "
                "Ask the human before any directory, glob or whole-repo format.\n"
            )
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
