## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Build rules

The source of truth is `DECISIONS.md` (why) and `API_DESIGN.md` (the contract). Domain terms are in `CONTEXT.md`. Read the relevant section before changing behaviour, and update it in the same change if a decision moves.

- **Isolation first.** Every change to an API route comes with cross-Owner tests (own / other Owner's / missing). Work test-first.
- **Only `*.repository.ts` files may import `PrismaService`, any `@prisma/*` package, `pg` or the generated client (`src/generated/prisma`).** Every repository method takes `ownerId` as its first argument, and every query filters on it. The only exemptions are listed in `backend/eslint.config.js`: the seed script, the Prisma wiring (`prisma.service.ts`, `prisma.module.ts`) and the two database-layer tests (`prisma.service.spec.ts`, `test/migrations.spec.ts`). ESLint enforces this, and inline `eslint-disable` comments are turned off.
- **Another Owner's resource is always the constant 404** (never 403, never an empty list, never a 422). No response contains `ownerId` or `sub`.
- **Every route needs a token.** There is no `@Public()` and no health route.
- **Version pins (from #3):** Node 24, TypeScript 6.0.3, `prisma` and `@prisma/client` 7.10.0 (the CLI's `latest` tag is an 8.0 RC), only `react-router` 8.4 (no `react-router-dom`), `@types/node` 24.x.
- **Never commit** tokens, emails, `.env` files or unscrubbed transcripts. Run `python3 transcripts/scrub.py` on logs before committing them.
- **Layout:** `backend/`, `frontend/`, `transcripts/`. `.claude/` is the brief's `/.agent/`.
