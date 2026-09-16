#!/usr/bin/env python3
"""Scrub session logs before they are committed to this public repo.

Usage: python3 transcripts/scrub.py <file>...   (rewrites files in place)

Redacts: email addresses (except Anthropic's noreply), JWT-shaped strings,
OAuth code/state/code_verifier values, and absolute home-directory paths.
Exits 1 if anything matching those patterns survives.
"""
import re
import sys

KEEP_EMAILS = {"noreply@anthropic.com", "nobody@example.invalid"}

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
JWT = re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*")
OAUTH_PARAM = re.compile(r"\b(code|state|code_verifier)=[A-Za-z0-9_~.%-]{16,}")
HOME = re.compile(r"/Users/[^/\s\"'\\]+")


def scrub(text: str) -> str:
    text = EMAIL.sub(lambda m: m.group(0) if m.group(0) in KEEP_EMAILS else "<redacted-email>", text)
    text = JWT.sub("<redacted-jwt>", text)
    text = OAUTH_PARAM.sub(lambda m: f"{m.group(1)}=<redacted>", text)
    text = HOME.sub("~", text)
    return text


def leftovers(text: str) -> list[str]:
    found = [e for e in EMAIL.findall(text) if e not in KEEP_EMAILS]
    found += JWT.findall(text) + [m.group(0) for m in OAUTH_PARAM.finditer(text)]
    found += [p for p in HOME.findall(text)]
    return found


def main() -> int:
    dirty = False
    for path in sys.argv[1:]:
        with open(path, encoding="utf-8") as f:
            text = scrub(f.read())
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        if rest := leftovers(text):
            dirty = True
            print(f"{path}: {len(rest)} matches left", file=sys.stderr)
    return 1 if dirty else 0


if __name__ == "__main__":
    sys.exit(main())
