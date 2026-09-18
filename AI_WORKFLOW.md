# AI workflow

How this repo was built: which model, which skills, what I decided myself, and what the agent was allowed to decide.

The workflow is Matt Pocock's agent skills, vendored into [`.claude/skills/`](.claude/skills/README.md) so they travel with a clone. I learned most of this from him.

## Model and effort

Opus 5 at medium effort, Claude Code as the harness, this repo as the
environment.

Medium is the default because a long session degrades: the further a context
window fills, the worse the output gets. I'd rather spend the budget on more
short sessions than on one deep one — so the lever I pull is `/clear`, not a
bigger effort setting.

## The artifacts are the memory

This is the part that makes the rest of the workflow safe. I clear the session
between every step, so no session inherits anything from the one before it. What
carries across is files in the repo:

| Artifact | Holds | Written by | Read by |
| --- | --- | --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | The rules every session must obey: the isolation invariant, the constant 404, the `*.repository.ts` import ban, version pins | Claude, after grilling with me | Every session, automatically |
| [`DECISIONS.md`](DECISIONS.md) | Why — Identity, Auth, Isolation, Frontend, API contract, Repo and tooling, HTTP hardening | Grilling sessions | Any session about to change behaviour |
| [`API_DESIGN.md`](API_DESIGN.md) | The contract: resources, routes, errors, and how the invariant is enforced in code | A grilling session about the API | `implement`, `code-review` |
| [`CONTEXT.md`](CONTEXT.md) | Domain vocabulary — Owner, Collection, Bookmark, and the relationships | `domain-modeling` | Every session, for naming |
| [`docs/research/`](docs/research/) | Findings with sources: tenant facts, library versions, the archived attempt | `research` | Whoever needs the fact |
| GitHub Issues | The plan, one fog patch or one slice per issue | `wayfinder`, `to-tickets` | Me, choosing what's next |

A fresh session is not a fresh start, because it reads all of this before it
does anything.

## Phase 1 — mapping

Every project starts somewhere (a requirement) and ends somewhere (the product).
`/wayfinder` draws the map between the two.

What it's really looking for is **fog**: anything on the route we don't yet know
— a decision not made, a fact not checked. Each patch of fog becomes one GitHub
issue, labelled by how it gets cleared:

- `wayfinder:grilling` — a decision I have to make
- `wayfinder:research` — a fact to go and find
- `wayfinder:task` — something only a human can do
- `wayfinder:prototype` — cheaper to try than to argue about
- `wayfinder:map` — the map itself

The map for this repo is [#1](../../issues/1), and it stays open: it's the
living plan, not a ticket.

## Phase 2 — clearing the fog

`/clear`, then take one issue.

**Grilling.** `/grilling on #8` and the model interviews me relentlessly about
one topic until the decision is actually made, not just gestured at. Whatever we
settle lands in `DECISIONS.md`. Issue [#8](../../issues/8) (*Data model and API
contract*) is where `API_DESIGN.md` came from.

**Research.** `/research on #2` and the model goes and reads primary sources,
then writes the finding to `docs/research/`. If it needs something only I can
do, it asks — verifying `/userinfo` against the real tenant needed me in a
browser with real credentials, so it became its own human ticket
([#16](../../issues/16)).

**Dropping things.** A grilling session will surface work that isn't worth
doing. I drop it on the spot rather than let it become scope, or file it as an
issue if it's real but not now. This is the main thing I do during grilling
that the model won't do for me: it is eager, and by default it will build
whatever came up. For example, I drop the offline access because it's not in the requirement, and I think it can be implemented later.

## Phase 3 — spec and slices

When every decision I think needs making is made — not every open issue, just
the ones that block code — I run `/to-spec` and then `/to-tickets`.

That produces **slices**: [#18](../../issues/18)–[#24](../../issues/24), each
one a vertical cut that ends in something runnable. Slice 2 is the token guard
and Owner-scoped repositories; slice 3 is the Collections and Bookmarks API with
the full cross-Owner matrix.

## Phase 4 — implement, review, merge

Per slice, each step in its own session:

1. `/implement on #19`. It works test-first via `tdd`, and opens a PR.
2. `/clear`.
3. `/code-review` on the PR — it reviews on two axes, Standards (does this
   follow the repo's documented rules?) and Spec (does it do what the issue
   asked?).
4. Fix what came up, or merge.
5. After fix of multiple findings, I rerun the `/code-review`

Merging is always mine. The agent never merges its own work.

## What stops it shipping something wrong

Review is the last gate, not the only one:

- **The invariant was written down before any code existed.** `CLAUDE.md` says
  another Owner's resource is always the constant 404, no response contains
  `ownerId` or `sub`, and every route needs a token. A session can't miss it.
- **Isolation is a test requirement, not a guideline.** Every change to an API
  route ships with the cross-Owner matrix: own / another Owner's / missing.
- **The boundary is enforced mechanically.** Only `*.repository.ts` may import
  Prisma, every repository method takes `ownerId` first, and ESLint fails the
  build otherwise — with inline `eslint-disable` turned off.
- **CI runs on every PR:** lint, typecheck, the OpenAPI and generated-types
  checks, the frontend build, then the tests.

## What I do myself

| Mine | The agent's |
| --- | --- |
| Every decision recorded in `DECISIONS.md` | Everything a closed decision already determines |
| Anything needing real credentials or a browser session | Anything fully specified (`ready-for-agent`) |
| Product intent, and what to cut | Finding facts, and citing them |
| Merging | Opening the PR |

The `ready-for-agent` / `ready-for-human` labels are how that line is recorded
on the issue itself.

## Evidence

- [`transcripts/`](transcripts/) — the session exports, committed as they are.
  Planning, the `/userinfo` verification, and one per slice.
- The issue history: every decision has a ticket, every ticket has a
  resolution.
- The PRs: each slice reviewed before merge.