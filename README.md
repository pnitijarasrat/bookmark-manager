# Bookmark Manager

Dear Reviewer,

I should say up front how this was built: I directed it, I didn't type it. The
workflow is in [AI_WORKFLOW.md](AI_WORKFLOW.md) and the unedited sessions are in
[transcripts/](transcripts/) — please read them, they tell you more about me than
this README does.

The decisions that are mine: the constant 404 for anything that isn't yours
(including an empty Collection — no 200s), no User table, no `offline_access` or
refresh tokens, and the scope cuts under "Skipped, and why". The rest I reviewed
and accepted from the model.

I'm early. Most of what I know — TypeScript, the auth model, this workflow — I
learned on my own time from courses and long YouTube videos, because I enjoy it
more than I'd enjoy most hobbies. What I'm still building is the judgement to
catch the model when it's subtly wrong. The transcripts show me doing that twice;
I want it to be far more often.

So if you're looking for experience, I understand moving on. If you're looking
for someone to train, I'd rather be judged on whether my review of this work was
good than on whether I typed the lines. Ask me about any decision in
[DECISIONS.md](DECISIONS.md) — for the ones I made I'll defend them, and for the
rest I'll tell you honestly that I took the model's reasoning and why I found it
convincing. Auth0 and JWT verification I met for the first time on this project.

Best regards,
Puriwat

A private bookmark manager: every User signs in with Auth0 and sees only their own Collections and Bookmarks. The one invariant the whole design serves is that **a User can never see, change, or learn that another Owner's data exists** — another Owner's resource answers exactly like one that was never there.

- A NestJS API (`backend/`, port 3001) that verifies an Auth0 access token on every route and scopes every query to the token's `sub`.
- A React + Vite SPA (`frontend/`, port 3000) that signs in with Authorization Code + PKCE and keeps its tokens in memory only.
- Postgres 17 in Docker Compose, seeded with two Owners so the isolation is visible.

## Prerequisites

- **Docker** — for Postgres, and for the backend tests (Testcontainers).
- **Node 24** (see `.nvmrc`). `nvm use` picks it up.

Nothing else: no Auth0 dashboard access is needed, and there are no secrets to obtain. The tenant values in the committed `.env.example` files are public, and both apps run as they are.

## Setup and run

```bash
git clone https://github.com/pnitijarasrat/bookmark-manager.git
cd bookmark-manager
npm install     # installs both apps, generates the Prisma client, creates both .env files
npm run dev     # Postgres + migrations + seed + API + SPA
```

`npm run dev` starts the Compose database (project `bbl-bookmarks`, host port `127.0.0.1:5434`), applies the migrations, runs the seed, and then starts the API and the SPA together. Open **http://localhost:3000** and click **Sign in**.

The port matters: `http://localhost:3000` is the tenant's only allowed callback and CORS origin, so the dev server uses `strictPort` and will fail rather than move to another port.

Signing in uses the tenant's existing test user through Auth0 Universal Login — the credentials come with the brief, not from this repo. Sign-up is disabled on the tenant, and there are no refresh tokens, so **a reload or a new tab needs an interactive sign-in**. That's a tenant limitation, explained under [DECISIONS.md → Tokens are kept in memory only](DECISIONS.md#tokens-are-kept-in-memory-only).

Other scripts: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run db:down` to stop Postgres (the volume survives; `docker compose down -v` wipes it).

### Seeing the seeded data as yourself

The seed creates two Owners:

- **Owner A** — you. A's `sub` is read from `SEED_OWNER_A_SUB`, which ships empty, because a real `sub` must never be committed to this public repo.
- **Owner B** — `auth0|000000000000000000000000`, who can never sign in. B's rows exist so you can check, in the database, that data you must never see is really there. Every one of B's titles and notes says so out loud ("Owner B only: if you can see this, isolation is broken").

So on a fresh clone only B is seeded, and your own account starts empty. To get A's demo data (two Collections — `Reading` with 55 Bookmarks so "Load more" appears, and `Recipes` left empty — plus three Uncategorised Bookmarks):

1. Sign in at http://localhost:3000.
2. Copy the access token from the `Authorization: Bearer …` header of any API request in the browser's Network tab.
3. Print your `sub` — the token stays on your machine, and only the `sub` is printed:
   ```bash
   npm run whoami --prefix backend -- <token>
   ```
4. Put it in `backend/.env` as `SEED_OWNER_A_SUB=auth0|…`.
5. Restart `npm run dev`.

The seed only touches an Owner that has no rows yet, so restarting `dev` never wipes what you created. `npm run db:seed:reset --prefix backend` deletes and re-creates just the two seed Owners' rows, and refuses to run against anything but the local Compose database.

### Seeing Owner B's rows

To prove B's data is in the database while never appearing in the signed-in app:

```bash
docker compose exec postgres psql -U bookmarks -d bookmarks -c "SELECT owner_id,
  (SELECT count(*) FROM collections c WHERE c.owner_id = o.owner_id) AS collections,
  (SELECT count(*) FROM bookmarks b WHERE b.owner_id = o.owner_id) AS bookmarks
  FROM (SELECT owner_id FROM collections UNION SELECT owner_id FROM bookmarks) o
  ORDER BY owner_id"
```

Both Owners have a Collection named `Reading` / `reading` and share some URLs, so any leak shows up immediately in the UI or in a search.

## Tests

```bash
npm test                      # everything: 412 backend + 121 frontend
npm test --prefix backend
npm test --prefix frontend
```

**Docker must be running for the backend tests.** They start a throwaway Postgres 17 with Testcontainers and apply the real migrations — no mocked database anywhere. Tokens are real RS256 JWTs signed by an in-process JWKS that stands in for the tenant, so the guard's actual verification path is exercised; what that leaves unproven is fetching the real tenant's keys, which the manual sign-in against the tenant covered ([docs/research/first-real-sign-in.md](docs/research/first-real-sign-in.md)).

The tests worth looking at first:

| File | What it proves |
|---|---|
| `backend/test/isolation.spec.ts` | The cross-Owner matrix. It **reads the table in [API_DESIGN.md §6](API_DESIGN.md#the-cross-owner-matrix)** and runs every cell — each route and verb against your own / another Owner's / a missing / a malformed ID / no token — so the document and the tests can't disagree. It also fails if the app has a route the table doesn't list. Every 404 is checked byte for byte, and no response may contain `ownerId` or either `sub`. |
| `backend/test/prisma-boundary.spec.ts` | Lints sample files to prove the ESLint rule that keeps Prisma inside `*.repository.ts` actually fires. |
| `backend/test/migrations.spec.ts` | Deleting a Collection keeps its Bookmarks (`collection_id` null, `owner_id` intact), and `prisma migrate diff` reports no drift. |
| `backend/test/repositories.spec.ts` | Every repository method, called with the wrong Owner. |
| `frontend/src/routes.spec.tsx` | The route guard, the dialogs, filters and "Load more" against a mocked API. |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, the OpenAPI spec check, the generated-types check, the frontend build and the full test suite on every push and PR.

## What I completed vs skipped

### Completed

- **Auth.** PKCE (S256) in the SPA, a stateless Bearer resource server in the API. A global guard verifies every route with `jose` — RS256 only, exact issuer, audience containment, `exp`, non-empty `sub`. There is no `@Public()` route and no health route to forget about.
- **Isolation, enforced in four layers** — the Owner passed explicitly as every repository method's first argument, an ESLint rule that keeps Prisma inside repositories, single `id AND owner_id` queries with no fetch-then-compare, and a composite foreign key so a Bookmark can't point at another Owner's Collection. Another Owner's ID is always the same constant 404. `ownerId` never appears in a response and a body containing it gets a 400.
- **The full API** — Collections and Bookmarks with POST/GET/PUT/PATCH/DELETE, `GET /collections/:id/bookmarks`, `collectionId` and `q` filters, cursor pagination, RFC 9457 problem+json errors, and `GET /me`. The contract is [API_DESIGN.md](API_DESIGN.md).
- **The SPA** — login page, app shell with the signed-in email, Bookmarks and Collections pages with filters in the URL, detail dialogs over each list, delete confirmations, "Load more", and an expired session that sends you back to `/login` instead of off-site.
- **Deleting a Collection keeps its Bookmarks**, done in the database with a hand-edited `ON DELETE SET NULL (collection_id)`, with the count shown in the confirmation.
- **Seed data for two Owners**, idempotent, with a per-Owner advisory lock so overlapping runs take turns.
- **The API contract is generated, not hand-copied** — `@nestjs/swagger` produces `backend/openapi.json`, `openapi-typescript` turns it into the SPA's types, and CI fails if either is stale.
- **533 tests** and the CI pipeline above.

### Skipped, and why

- **The threat model document** ([#15](https://github.com/pnitijarasrat/bookmark-manager/issues/15), [#23](https://github.com/pnitijarasrat/bookmark-manager/issues/23)) is not written yet. Its substance exists — [API_DESIGN.md §6](API_DESIGN.md#6-how-the-privacy-invariant-is-enforced-in-code) lists each enforcement layer, and DECISIONS.md names the accepted risks — but it hasn't been pulled into one document that maps each threat to the test or lint rule that mitigates it. This is the main known gap.
- **A User table.** A User exists only as the `sub` in a verified token, so nothing is written on sign-in. A row would need creating and syncing, and nothing needs it.
- **Refresh tokens, silent renewal and persisted tokens.** `offline_access` is outside the brief's scope, and `prompt=none` returns `consent_required` on this tenant even from a top-level redirect — most likely because the callback is `localhost`, which we can't change. Keeping tokens in `localStorage` would survive reloads but leaves a 2-hour token where any XSS can read it. So: re-login on reload, deliberately.
- **Rate limiting.** The app only runs locally, so it would protect nothing real. A deployment would need it. Auth0's own `/userinfo` limit is handled by caching `/me` per token until the token expires.
- **Postgres row-level security.** It's the only design where a forgotten filter still returns nothing, but it would need a per-request transaction, a second database role and its own test suite. Enforcement was kept in one readable layer instead, with a lint rule making the boundary mechanical. The trade-off is written up in full under [DECISIONS.md → The Owner scope lives in a repository layer](DECISIONS.md#the-owner-scope-lives-in-a-repository-layer).
- **Two real sign-in-able Users.** The tenant has one test user and sign-up is disabled, so Owner B can only ever be a seeded `sub`. Isolation between two live sessions is therefore proven by the test suite and by the `psql` query above, not by signing in twice.
- **Out of scope by the brief, and left out on purpose:** fetching page titles, URL normalisation and duplicate detection, tags, sharing, soft delete and undo, client-chosen sort orders, date filters, and searching `notes`.
- **Anything deployment-shaped** — containers for the apps, migrations strategy beyond `migrate deploy`, secret management, observability. This is a local review build.

## The documents

| File | What's in it |
|---|---|
| [DECISIONS.md](DECISIONS.md) | Why everything is the way it is. Each decision has its rejected alternatives and consequences. The source of truth for behaviour. |
| [API_DESIGN.md](API_DESIGN.md) | The contract: resources, routes, field rules, errors, and the cross-Owner matrix the tests execute. |
| [CONTEXT.md](CONTEXT.md) | The domain terms — User, Owner, Collection, Bookmark. |
| [CLAUDE.md](CLAUDE.md) | The rules the agent works under. |
| [docs/research/](docs/research/) | What was measured before building: the Auth0 tenant's probed facts and the first real sign-in, the September 2026 library versions behind the pins, and the lessons taken from the archived first attempt. |
| [transcripts/](transcripts/) | The agent session logs, committed unscrubbed. |

`.claude/` is this repo's version of the brief's `/.agent/` folder, because it's the only folder Claude Code reads. The work itself was planned and tracked in this repo's [GitHub Issues](https://github.com/pnitijarasrat/bookmark-manager/issues).
