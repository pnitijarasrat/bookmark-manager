#!/usr/bin/env bash
# Are all the skills our vendored skills delegate to actually here?
#
# Skills name each other in two syntaxes, and an earlier version of this check
# only caught the first, which is how `implement` was vendored without `tdd`:
#   1. Skill tool with "tdd"   /   Skill tool twice, for "grilling" and "..."
#   2. /tdd
#
# Run from the repo root. Exits non-zero if something is missing.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Referenced on a line that invokes a skill, either syntax.
refs=$(
  {
    grep -h 'Skill tool' "$DIR"/*/SKILL.md | grep -ohE '"[a-z][a-z-]+"' | tr -d '"'
    # A slash-command: not preceded by '<' (a closing tag like
    # </spec-template>) or by a path character, and not followed by '/' (a path
    # segment like .../issues/...).
    grep -ohE '(^|[^[:alnum:]/_.<-])/[a-z][a-z-]+($|[^[:alnum:]/_-])' "$DIR"/*/SKILL.md \
      | grep -oE '/[a-z][a-z-]+' | tr -d '/'
  } 2>/dev/null | sort -u
)

# setup-matt-pocock-skills is referenced only in "if these docs are missing,
# run /setup-matt-pocock-skills" fallbacks. It is a one-time setup skill and its
# output is already committed to docs/agents/, so it is deliberately not here.
ALLOW="setup-matt-pocock-skills"

missing=""
for r in $refs; do
  [ -d "$DIR/$r" ] && continue
  case " $ALLOW " in *" $r "*) continue ;; esac
  # Only names that look like a skill, i.e. a sibling exists upstream. We can't
  # check upstream from a clone, so fall back to reporting and let a human look.
  missing="$missing $r"
done

if [ -n "$missing" ]; then
  echo "Referenced but not vendored (check whether each is a skill or just prose/an anchor):"
  for m in $missing; do echo "  $m"; done
  exit 1
fi

echo "Closure is closed: $(ls -1d "$DIR"/*/ | wc -l | tr -d ' ') skills, nothing dangling."
