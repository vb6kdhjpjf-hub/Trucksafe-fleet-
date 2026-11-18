#!/usr/bin/env python3
"""Fail-closed lexical guards for schema-only PostgreSQL snapshots.

This is deliberately a lexer, not a full PostgreSQL parser. It blanks comments,
quoted strings/identifiers, and dollar-quoted bodies while preserving statement
boundaries. Any unterminated lexical construct is rejected.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path


class SnapshotValidationError(ValueError):
    pass


def _blank_sql_literals_and_comments(sql: str) -> str:
    out = list(sql)
    n = len(sql)
    i = 0

    def blank(start: int, end: int) -> None:
        for pos in range(start, end):
            if out[pos] not in "\r\n":
                out[pos] = " "

    while i < n:
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < n else ""

        if ch == "-" and nxt == "-":
            end = sql.find("\n", i + 2)
            if end < 0:
                end = n
            blank(i, end)
            i = end
            continue

        if ch == "/" and nxt == "*":
            start = i
            i += 2
            depth = 1
            while i < n and depth:
                if sql.startswith("/*", i):
                    depth += 1
                    i += 2
                elif sql.startswith("*/", i):
                    depth -= 1
                    i += 2
                else:
                    i += 1
            if depth:
                raise SnapshotValidationError("Unterminated block comment")
            blank(start, i)
            continue

        # PostgreSQL dollar-quoted strings: $tag$ ... $tag$ (including $$).
        if ch == "$":
            # A dollar-quote opener must not be immediately preceded by an
            # identifier character; otherwise this may be part of an
            # unquoted PostgreSQL identifier (for example column$tag$).
            boundary_ok = i == 0 or not (sql[i - 1].isalnum() or sql[i - 1] in "_$")
            match = re.match(r"\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$", sql[i:]) if boundary_ok else None
            if match:
                delimiter = match.group(0)
                start = i
                close = sql.find(delimiter, i + len(delimiter))
                if close < 0:
                    raise SnapshotValidationError("Unterminated dollar-quoted body")
                i = close + len(delimiter)
                blank(start, i)
                continue

        # Single-quoted strings, including E'...' escape strings.
        if ch == "'":
            start = i
            prefix_is_escape = (
                i > 0 and sql[i - 1] in "eE"
                and (i < 2 or not (sql[i - 2].isalnum() or sql[i - 2] in "_$"))
            )
            i += 1
            closed = False
            while i < n:
                if prefix_is_escape and sql[i] == "\\":
                    i += 2
                    continue
                if sql[i] == "'":
                    if i + 1 < n and sql[i + 1] == "'":
                        i += 2
                        continue
                    i += 1
                    closed = True
                    break
                i += 1
            if not closed:
                raise SnapshotValidationError("Unterminated single-quoted string")
            blank(start, i)
            continue

        # Quoted identifiers cannot contain executable SQL keywords.
        if ch == '"':
            start = i
            i += 1
            closed = False
            while i < n:
                if sql[i] == '"':
                    if i + 1 < n and sql[i + 1] == '"':
                        i += 2
                        continue
                    i += 1
                    closed = True
                    break
                i += 1
            if not closed:
                raise SnapshotValidationError("Unterminated quoted identifier")
            blank(start, i)
            continue

        i += 1

    return "".join(out)


def validate_schema_only_snapshot(sql: str) -> None:
    if not sql.strip():
        raise SnapshotValidationError("Snapshot is empty")

    code = _blank_sql_literals_and_comments(sql)
    if not code.strip():
        raise SnapshotValidationError("Snapshot contains no SQL statements")

    # Inspect each top-level SQL statement independently. The lexical pass
    # preserves semicolons/newlines but blanks all non-executable text.
    for statement in code.split(";"):
        normalized = statement.strip()
        if not normalized:
            continue
        if re.match(r"(?is)^COPY\b", normalized) and re.search(
            r"(?is)\bFROM\s+STDIN\b", normalized
        ):
            raise SnapshotValidationError("Snapshot contains a COPY ... FROM stdin data block")
        if re.match(r"(?is)^INSERT\s+INTO\b", normalized):
            raise SnapshotValidationError("Snapshot contains a top-level INSERT INTO statement")


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: validate_schema_snapshot.py <schema.sql>", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    try:
        validate_schema_only_snapshot(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, SnapshotValidationError) as exc:
        print(f"Snapshot validation failed: {exc}", file=sys.stderr)
        return 1
    print("Schema-only snapshot validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
