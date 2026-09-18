# Vendored skills

Matt Pocock's agent skills, vendored so they travel with a clone instead of
depending on each machine having the plugin installed.

## Invoked directly

| Skill | What it does |
| --- | --- |
| `wayfinder` | Plan work too big for one session as a map of decision tickets. |
| `grilling` | Stress-test a plan or decision by relentless questioning. |
| `grill-me` | User-invoked entry point to `grilling`. |
| `to-spec` | Turn a resolved discussion into a spec. |
| `to-tickets` | Break a spec into tracker tickets with blocking edges. |
| `implement` | Build the work a spec or set of tickets describes. |
| `code-review` | Review changes since a fixed point on Standards and Spec axes. |

## Pulled in as dependencies

These are here because a skill above delegates to them by name. Without them,
the delegating skill dead-ends mid-run.

| Skill | Delegated from |
| --- | --- |
| `tdd` | `implement` ("use /tdd where possible, at pre-agreed seams") |
| `codebase-design` | `tdd`, for the module/seam/depth vocabulary when an interface shape is in question |
| `research` | `wayfinder` (AFK tickets, resolved in parallel subagents) |
| `prototype` | `wayfinder` (raise fidelity with a cheap artifact) |
| `domain-modeling` | `wayfinder`, alongside `grilling`, on every conversation ticket |

Note that `implement` also delegates to `code-review`, which is already above.

## Checking the closure

Run from the repo root:

```sh
./.claude/skills/check-closure.sh
```

It reports any skill a vendored `SKILL.md` names but that isn't present, and
exits non-zero. **Run it after adding or removing a skill here** — a dangling
delegation doesn't fail loudly, it just leaves a skill that stops halfway.

The check reads both syntaxes skills use to call each other, `Skill tool with
"tdd"` and `/tdd`. An earlier version only caught the first, which is how
`implement` initially got vendored without `tdd` or `codebase-design`.

### The one deliberate exception

`setup-matt-pocock-skills` is named by `to-spec`, `to-tickets`, `code-review`
and `wayfinder`, and is **not** vendored. It is a one-time setup skill, it has
already been run against this repo, and its output is committed at
`docs/agents/`. The references are all "if those docs are missing, run
`/setup-matt-pocock-skills`" fallbacks, which don't fire because the docs exist.
It is allowlisted in the check script, with that reasoning inline.

## Repo docs these skills read

- `to-spec`, `to-tickets`, `code-review`, `wayfinder` → `docs/agents/issue-tracker.md`
- `to-spec`, `to-tickets` → `docs/agents/triage-labels.md`
- the engineering skills, before exploring → `docs/agents/domain.md`
- `domain-modeling`, `wayfinder` → `CONTEXT.md`, `docs/adr/`

Those stay at their documented paths because the skills reference them there
literally; moving them under `.claude/` would break the lookup.

## Provenance

Copied from the `mattpocock-skills` plugin, not authored here. Don't edit these
to fix a bug; fix it upstream and re-vendor, or the next refresh reverts it.

- Upstream: https://github.com/mattpocock/skills
- Plugin: `mattpocock-skills@claude-plugins-official`
- Version: `1.2.3`
- Commit: `0ab1b63a410a03d3627979a109c8695de27af954`
- Vendored: 2026-09-18
- Licence: MIT (`LICENSE` in this directory)

Upstream groups skills under `skills/engineering/` and `skills/productivity/`;
that grouping is flattened here because Claude Code discovers a skill by its
directory name under `.claude/skills/`. Each skill is a `SKILL.md` plus an
`agents/openai.yaml` for Codex-style harnesses, kept as-is. Some carry extra
reference files (`tdd/tests.md`, `tdd/mocking.md`, `prototype/UI.md`,
`domain-modeling/ADR-FORMAT.md` and so on), copied whole.

## Refreshing

Re-copy each skill directory from upstream `skills/*/`, update the version,
commit and date above, then run the closure check.

## Name collision

Vendored `code-review` takes the bare name `code-review`, which shadows the
harness built-in of the same name. `/code-review` is therefore ambiguous between
Matt's Standards-and-Spec review and the built-in diff review. Renaming this
directory resolves it, but the `name:` in its frontmatter has to match.
