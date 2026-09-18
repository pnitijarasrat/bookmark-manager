# Lessons from the archived attempt

Research for [#4](https://github.com/pnitijarasrat/bookmark-manager/issues/4), part of map #1.
Source: [pnitijarasrat/bookmark-manager-archive](https://github.com/pnitijarasrat/bookmark-manager-archive)
at `c30f122` (its only branch, `main`), plus its 11 issues and 1 PR. The archive is input, not precedent: nothing below is decided here.

Citation key: **A#n** = archive issue/PR n; **ADR-000n** = `docs/adr/000n-*.md` in the archive; file paths are relative to the archive root.

## TL;DR

- The archive produced a strong spec (A#1), six ADRs and a tracer-bullet slice (A#2, PR A#12): Auth0 sign-in plus a token-verifying `GET /me`. **No database, no Prisma, no Collections or Bookmarks, no seed data, and no cross-Owner tests were ever built.** 9 of 10 slices are still open.
- All work happened in one day (commits 12:48 to 14:46, +0700). Most of the implementation time went into one ticket, through three review-and-fix rounds on configuration and error handling. The ownership seam, which the spec called "the deliverable" (A#4), was never reached.
- Worth reusing: the token-validation rules and the fake-JWKS test harness; not-found over forbidden; set-null on Collection delete; the "PUT never creates" rule; the tenant facts it probed; the port/CORS constraints; the React Router v8 import and loader findings.
- Worth reconsidering: `/me` depended on a userinfo assumption nobody verified; seed data was deferred, but our brief requires it; the 404 body includes `instance` (the request path), which conflicts with its own "byte-identical 404" test plan; the glossary differs from ours (Person/subject vs User); there is no one-command dev setup.

## 1. What it decided, and why

### Auth architecture
- **The API accepts only the access token** for audience `https://bbl-candidate-test-api`, and rejects ID tokens (ADR-0002). Reasons given: an ID token's `aud` is the client, so accepting it accepts a credential that was never addressed to the API. The tenant also advertises HS256 for ID tokens, which the RS256-only JWKS cannot verify, so accepting ID tokens would invite `alg` confusion.
- **Validation rules** (ADR-0002, `backend/src/auth/access-token-verifier.ts`, `API_DESIGN.md`): `jose` `jwtVerify` with `algorithms: ['RS256']`, a remote JWKS cached and selected by `kid`, exact issuer match including the trailing slash, audience must contain the API id, `exp`/`nbf` enforced, `sub` and `exp` required.
- **A global guard with no opt-out.** It is registered as `APP_GUARD` (`backend/src/auth/auth.module.ts`), and a test pins it using a controller that has no auth annotations. On refusal the body is a bare 401 plus `WWW-Authenticate: Bearer`; the real reason goes only to the log (`access-token.guard.ts`).
- **The SPA** uses `@auth0/auth0-spa-js` with `cacheLocation: 'memory'`, `useRefreshTokens: false`, scope exactly `openid profile email`, and an explicit `audience` (ADR-0006, `frontend/src/auth/auth0-client.ts`). The reason: nothing that outlives the tab is stored, and `offline_access` is not in the brief's scope. The Auth0 client is a module-level singleton because router loaders cannot call hooks.
- **The accepted cost of ADR-0006:** a hard reload restores the session through a hidden `prompt=none` iframe. That needs a third-party cookie, so in Safari or with third-party cookies blocked the reload lands on a signed-out page (`API_DESIGN.md`, "What the browser stores"). The library still writes the PKCE transaction to `sessionStorage` and an `is.authenticated` boolean cookie. PR A#12's review caught an earlier comment that wrongly claimed nothing was written.
- **Ports:** the frontend is on 3000 with `strictPort` (`frontend/vite.config.ts`), because the tenant's callback and logout URLs are fixed. The backend is on 3001. CORS allows exactly the frontend origin, with `credentials: false` (`backend/src/configure-app.ts`).

### Data model and identity
- **No local user table:** `ownerId` is the token's `sub` (ADR-0003). Reasons given: one source of truth for identity, and no upsert-on-request provisioning. Costs it accepted: the system cannot look people up (which blocks sharing, ADR-0001), a change of identity provider means a data migration, and a second seeded Owner would need a fabricated `sub`.
- **Planned schema** (A#1, A#4, A#7, never built): Collection has `id, name, ownerId, createdAt, updatedAt`. Bookmark has `id, url, title, notes?, collectionId?, ownerId, createdAt, updatedAt`. Both are indexed on `ownerId`, and Bookmark also on `collectionId`. Prisma and `@prisma/client` were to be pinned to exactly 7.10.0 with `overrides`, because the `prisma` CLI's `latest` tag pointed at an 8.0.0 RC (A#1, "Persistence"; this is time-sensitive and needs re-checking).

### Isolation approach
Planned in A#1 and A#4, never implemented:
- **A repository layer** in which every method takes a required `ownerId`, so an unscoped query does not typecheck. Prisma models may not be referenced outside the repository files. The spec says this rule is enforced "in review", which means nothing mechanical enforces it.
- **Single-query resolution:** `WHERE id = ? AND ownerId = ?`, and zero rows means 404. The spec rules out fetch-then-compare, citing the extra round trip and a timing difference between the two cases (ADR-0005).
- **A sharing seam:** one "may this subject read this collection?" function with one call site, and no share-related vocabulary in the glossary or schema (ADR-0001).
- **"Four independent layers"** that would all have to fail for a leak (A#11): token audience, required-parameter scoping, single-query resolution, and identical 404 bodies.

### Delete semantics
- **Deleting a Collection sets its Bookmarks' `collectionId` to null** (Postgres `ON DELETE SET NULL`), so the Bookmarks survive as Uncategorised (ADR-0004). Reasons given: `collectionId` is nullable in the brief's own shape; cascade turns a low-intent click into irreversible loss; refuse-if-non-empty forces busywork; a per-request choice doubles the test surface. A#10 also required the confirmation dialog to state the consequence, and the frontend to revalidate Bookmark data after a delete.
- Hard deletes only. Soft delete, undo and trash were out of scope (A#1).

### API shape
All planned in A#1 and A#5 to A#9. Only `/me` exists.
- **404, never 403**, for another Owner's data, on every verb, on the nested route and on the `collectionId` filter (ADR-0005). The server log records `owner_mismatch` versus `absent` at `warn`.
- **PUT never creates.** Absent and not-owned ids both return 404. Omitted optional fields become null, and PATCH merges.
- **Validation** was to use `class-validator` with whitelist and forbid-non-whitelisted, so that `ownerId`, `id` or `createdAt` in a body returns 400 instead of being silently dropped. It was chosen over Zod because the OpenAPI generator reads its decorators. The dependencies were removed again in review because nothing used them yet (commit `d8dd503`).
- **URLs** must be http or https, which blocks stored XSS through `javascript:` links. They are stored as given, with no normalisation and no deduplication.
- **Filters:** `collectionId`, a separate `uncategorised` flag (a query string cannot express null), and a case-insensitive `q` over title, URL and notes. Collections filter by name. Pagination is offset-based, default 50, maximum 100, with a total count.
- **Errors use RFC 9457** problem details, derived from the status alone (`backend/src/http/problem-details.filter.ts`).
- **OpenAPI** was to be generated from the Nest decorators, with frontend types generated from that document (A#1, A#4). Never built.
- **`/me`** was to return `sub` plus userinfo profile fields, cached by subject, with a stale fallback and then a degraded response (A#3). Today it returns `{ subject }` only (`backend/src/me/me.controller.ts`).

### Test strategy
- **One seam: the backend HTTP boundary.** Tests boot the real `AppModule` against a real Postgres (planned), with only the JWKS faked by a local RSA keypair served over HTTP (`backend/test/harness/`). Reason given: repository unit tests cannot catch a route that bypasses the repository, a guard that did not run, or a 404 that leaks information (A#1, "Testing Decisions").
- **A data-driven cross-Owner matrix** of routes × verbs, asserting 404 in every cell and a byte-identical body, so that a new resource is one new row (A#11). Never built.
- **No frontend automated tests.** The archive called them "theatre", since the guarantee is enforced server-side (README).
- **At the archive head:** 13 unit tests (config) and 25 e2e tests (18 token, 5 CORS, 2 `/me`). The token suite covers a missing credential, a non-Bearer scheme, the wrong audience, a real ID token, an unknown key, `alg: none`, PS256 under the published key, HS256, expired, not-yet-valid, the wrong issuer, and a trailing-slash issuer mismatch (PR A#12).
- **Mutation check** (PR A#12): the PS256 test passed even with the RS256 allowlist deleted, because the fake JWKS's `alg` hint was doing the rejecting. The harness now publishes keys without `alg`. This lesson transfers directly to our harness.

## 2. Where it stalled or went wrong

1. **The core of the product was never reached.** The spec named the ownership seam as the thing to build first (A#1, "Implementation order"; A#4). But the only merged work is auth and `/me`. `backend/package.json` has no Prisma, and the repo has no docker-compose, no schema and no seed.
2. **Effort went into polishing the tracer bullet.** After the initial slice (`c5c107e`) came three follow-up commits: review fixes, a config-reader refactor, and nine misconfiguration fixes (`d8dd503`, `0990433`, `509a071`), including a dynamic-import bootstrap that shows config errors on screen. Each fix is defensible, but together they consumed the day's budget on a slice whose job was to be thin.
3. **The end-to-end sign-in was never verified by a human.** PR A#12, "Not verified": nobody clicked through Auth0 and saw a subject render.
4. **The `/me` profile plan rested on an unverified assumption.** It assumed the access token's `aud` is an array that includes the userinfo endpoint. `scripts/verify-auth0.sh` was written to check this, but A#3 has no recorded outcome, so the design stayed unresolved.
5. **Seed data was deferred** (A#1, "Out of Scope"), even though our brief requires seed data for at least two Users. ADR-0003's consequence remains: the second Owner can only be a fabricated `sub` that nobody can sign in as.
6. **The spec contradicts itself on the 404 body.** The filter sets `instance: request.originalUrl`, so the 404 for `/collections/<theirs>` and the 404 for `/collections/<fabricated>` differ in `instance`. That breaks the planned "byte-identical to the 404 for a fabricated id" assertion (A#5, A#9, A#11) unless the comparison normalises `instance` or `instance` is dropped. No test caught this, because no 404 test existed.
7. **Small tracker slips.** A#2 says "Profile enrichment is ticket #2" when it means #3 (noted in PR A#12). The parent A#1 was never closed or updated.
8. **"Prisma models only inside repositories" was a review convention,** not an enforced rule (A#1). Nothing mechanical, such as a lint rule or a module boundary, would catch a violation.

## 3. Reuse or reconsider (for this effort)

**Likely reusable (re-verify versions and tenant facts):**
- ADR-0002's validation rule set, and the fake-identity-provider harness design. That includes the two published keys (to prove `kid` selection), a withheld key, PS256 and HS256 confusion tokens, and keys published without `alg`.
- ADR-0005 (404 over 403, with the real reason logged) and the single-query `id AND ownerId` lookup.
- ADR-0004 (set null on delete, enforced in the schema, with a warning in the confirmation dialog and revalidation afterwards).
- PUT never creates; 400 on unknown or immutable fields rather than silently stripping them; the http/https URL allowlist.
- The tenant facts: S256 supported, public client with no secret, JWKS with two RS256 keys, HS256 listed for ID tokens, and `unauthorized_client` for the password grant (ADR-0002). Also: omitting `audience` produces an opaque token, which it called "the most likely misconfiguration".
- Port 3000 with `strictPort`, API on another port, CORS fixed to one origin without credentials. Also the trailing-slash `FRONTEND_ORIGIN` trap (`509a071`).
- React Router v8: import from `react-router` and `react-router/dom` (there is no `react-router-dom` v8); loaders need an Auth0 client singleton; handle `missing_transaction` when the user presses Back onto `/callback` (`509a071`).
- The data-driven cross-Owner matrix idea, with "adding a resource adds a row" as a stated deliverable.

**Worth deciding afresh:**
- **The glossary.** The archive uses Person/Owner/subject and bans "user". Our `CONTEXT.md` uses User and Owner. Pick one on purpose.
- **Identity storage.** Using `sub` directly with no user table (ADR-0003) is simple. But seeding at least two Users with no dashboard access means at least one seeded Owner is fabricated. Decide whether that is acceptable, and how it is demonstrated.
- **`/me` contents.** Run the probe, or do without it: `/me` could return `sub` plus ID-token claims shown by the SPA. Avoid a design that depends on an unverified userinfo audience.
- **Session strategy.** Memory-only with no refresh tokens (ADR-0006) means Safari users re-authenticate on every reload. Check whether that trade-off holds up under the brief.
- **Problem-details `instance`.** Drop it or normalise it so the two 404 cases really are identical.
- **Enforcement strength.** Consider something stronger than "enforced in review": a lint or import boundary on the Prisma client, a Prisma client extension that injects `ownerId`, or Postgres RLS.
- **Scope and sequencing.** Take the archive's lesson: build the DB, the ownership seam, seeding and the cross-Owner matrix before polishing config and error UX. Also include the one-command dev setup (docker-compose) that the archive never had.
- **Validation library.** The archive's reason for `class-validator` (OpenAPI introspection) is only as strong as the need for OpenAPI and generated types, which the brief does not require.
