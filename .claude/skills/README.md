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
| `code-review` | Review changes since a fixed point on Standards and Spec axes. |

## Pulled in as dependencies

`wayfinder` delegates to these by name, so they are vendored too; without them
its research, prototype and conversation steps dead-end.

| Skill | Delegated from |
| --- | --- |
| `research` | `wayfinder` (AFK tickets, resolved in parallel subagents) |
| `prototype` | `wayfinder` (raise fidelity with a cheap artifact) |
| `domain-modeling` | `wayfinder`, alongside `grilling`, on every conversation ticket |

The dependency closure is closed: every skill these nine name by name is present
in this directory. Re-check with

```sh
grep -ohE 'Skill tool (twice, )?(for|with) "[a-z-]+"' .claude/skills/*/SKILL.md \
  | grep -oE '"[a-z-]+"' | sort -u
```

## Repo docs these skills read

- `to-spec`, `to-tickets`, `code-review` → `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`
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
`agents/openai.yaml` for Codex-style harnesses, kept as-is.

## Refreshing

Re-copy each skill directory from upstream `skills/*/`, then update the version,
commit and date above and re-run the closure check.

## Name collision

Vendored `code-review` takes the bare name `code-review`, which shadows the
harness built-in of the same name. `/code-review` is therefore ambiguous between
Matt's Standards-and-Spec review and the built-in diff review. Renaming this
directory resolves it, but the `name:` in its frontmatter has to match.
