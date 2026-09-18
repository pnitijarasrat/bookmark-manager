# `.claude/` — the agent folder

This is the brief's `/.agent/`: everything an agent needs to work in this repo
that isn't source code. It is committed, so a clone is enough — no per-machine
plugin installs.

```
.claude/
├── README.md       this file
├── skills/         nine vendored skills, MIT, see its README
└── worktrees/      scratch, git-ignored
```

## Skills

`skills/` holds nine of Matt Pocock's skills, vendored from the
`mattpocock-skills` plugin at v1.2.3. Six are invoked directly (`wayfinder`,
`grilling`, `grill-me`, `to-spec`, `to-tickets`, `code-review`) and three are
there because `wayfinder` delegates to them by name (`research`, `prototype`,
`domain-modeling`). The dependency closure is closed and there is a one-liner in
`skills/README.md` to re-verify it.

Skills are discovered by directory name, so the upstream
`engineering/`–`productivity/` grouping is flattened. Provenance, licence,
refresh steps and one name collision to be aware of are all in
`skills/README.md`.

## Docs the skills read, which live outside this folder

These stay where they are because the skills reference the paths literally:

| Path | Read by |
| --- | --- |
| `docs/agents/issue-tracker.md` | `to-spec`, `to-tickets`, `code-review`, `wayfinder` |
| `docs/agents/triage-labels.md` | `to-spec`, `to-tickets` |
| `docs/agents/domain.md` | the engineering skills, before exploring |
| `CONTEXT.md`, `docs/adr/` | `domain-modeling`, `wayfinder` |
| `DECISIONS.md`, `API_DESIGN.md` | everything; the why and the contract |

## What is git-ignored, and why

Only two things, both deliberately:

- `.claude/worktrees/` — scratch checkouts, regenerated on demand.
- `.claude/settings.local.json` — per-machine permissions and env, which differ
  per developer and can contain local paths.

Everything else in here is committed on purpose.
