# Decisions

The justification for every design choice in the private bookmark manager. Domain terms (User, Owner, Collection, Bookmark) are defined in [CONTEXT.md](CONTEXT.md). The plan is tracked in [#1](https://github.com/pnitijarasrat/bookmark-manager/issues/1).

Each decision has four parts: **Decision**, **Why**, **Rejected alternatives** and **Consequences**. Sections are grouped by area. Areas not listed yet are still being decided.

**Fixed inputs.** The brief and the Auth0 tenant are given and aren't up for debate. The tenant (`dev-yg`) has a public SPA client (no secret), and its only allowed callback, logout return, CORS origin and web origin is `http://localhost:3000`. Its access tokens are RS256 JWTs that carry `sub` but no profile claims, and last 2 hours. We have no dashboard access. The tenant facts come from [#2](https://github.com/pnitijarasrat/bookmark-manager/issues/2) and [docs/research/first-real-sign-in.md](docs/research/first-real-sign-in.md).

---

## Identity

### Universal Login with existing database users, no `offline_access`

From [#13](https://github.com/pnitijarasrat/bookmark-manager/issues/13).

- **Decision:** Users sign in through Auth0 Universal Login with existing `Username-Password-Authentication` users. The scope stays at `openid profile email`, fixed by the brief, so `offline_access` isn't requested.
- **Why:** it's the only sign-in path that is both available and reliable on this tenant. Sign-up is disabled, and the brief fixes the scope.
- **Rejected alternatives:**
  - **Google sign-in through Auth0 developer keys.** It would give distinct real Users without dashboard access, but developer keys aren't meant for real use, and they break SSO.
  - **Adding `offline_access`.** It goes beyond the brief's scope, and whether refresh tokens would be issued depends on dashboard settings we can't see.
- **Consequences:** there are no refresh tokens. Only one test user exists, so only one seeded Owner can actually sign in (see [Seed data](#seed-data)).

### No User table: the Owner is the Auth0 `sub`

From [#13](https://github.com/pnitijarasrat/bookmark-manager/issues/13) and [#6](https://github.com/pnitijarasrat/bookmark-manager/issues/6).

- **Decision:** the database has no User table. A User exists only as the `sub` in a verified access token. Collections and Bookmarks store that `sub` as their Owner. Its format is `auth0|<24 lowercase hex chars>`.
- **Why:** the `sub` is stable and is the only identity the access token carries. Keeping a User row would mean creating it on first sign-in and keeping profile data in sync, and nothing needs that row.
- **Rejected alternatives:** a User table keyed on `sub`, with a row created on the first request.
- **Consequences:**
  - Nothing is written on sign-in.
  - Profile data for `/me` is never stored in the database. Where it comes from is decided in [/me comes from /userinfo, cached until the token expires](#me-comes-from-userinfo-cached-until-the-token-expires).

### /me comes from /userinfo, cached until the token expires

From [#6](https://github.com/pnitijarasrat/bookmark-manager/issues/6), checked by [#16](https://github.com/pnitijarasrat/bookmark-manager/issues/16) and built in [#22](https://github.com/pnitijarasrat/bookmark-manager/issues/22).

- **Decision:**
  - **Source:** the API calls the tenant's `/userinfo` (`<AUTH0_ISSUER>userinfo`) with the caller's own Bearer token, after the token guard has verified it.
  - **Cache:** the result is kept in memory, keyed by the token's SHA-256, until the token's `exp`. Concurrent requests with one token share a call. Expired entries are swept on each call, and failures are never kept.
  - **Body:** `{ email, name, picture }`. A field that `/userinfo` leaves out, or sends as a non-string, is `null`, and the key is kept. `sub` and every other claim are dropped.
  - **Failures:** a `401` from `/userinfo` is a `401`. Any other failure (another status, a body that isn't a JSON object, a network error or a 5 s timeout) is a problem+json `502`.
  - **SPA:** the layout route's loader loads `/me` and sets `shouldRevalidate: () => false`. If `/me` fails with anything but a `401`, the shell leaves the email out and the pages still load.
- **Why:**
  - **The access token carries only `sub`** ([#13](https://github.com/pnitijarasrat/bookmark-manager/issues/13)), but its `aud` includes `/userinfo`. [#16](https://github.com/pnitijarasrat/bookmark-manager/issues/16) confirmed that the server-side call returns `email`, `name` and `picture`.
  - **`/userinfo` is rate-limited** (300 per window, and failed calls count too, per [#16](https://github.com/pnitijarasrat/bookmark-manager/issues/16)), and React Router re-runs a layout loader after every action. The cache and `shouldRevalidate` keep it to about one call per token.
  - **Keying on a hash** means the cache never holds the raw token. Tying an entry to `exp` means it can't outlive the token it was fetched with.
  - **`sub` is left out** for the same reason as `ownerId` (see [Clients can never set or see `ownerId`](#clients-can-never-set-or-see-ownerid)).
  - **A `502`** tells the client the fault is upstream, not its request. The email is only a label, so its failure shouldn't take the app down.
- **Rejected alternatives:**
  - **The SPA reading its ID token.** It works, but it leaves `/me` without a use and splits identity between two sources.
  - **Calling `/userinfo` on every request.** It burns the rate limit.
  - **A cache with a fixed TTL.** It could outlive the token.
  - **Exposing `sub` in `/me`.**
- **Consequences:**
  - A changed email shows up with the next token, at most one token lifetime later (2 h on this tenant).
  - The cache lives in one process and is lost on restart, which is fine for a single local API.
  - `/me` is in the cross-Owner matrix with only the own and no-token columns, since it takes no ID.

---

## Auth

Decided in [#5](https://github.com/pnitijarasrat/bookmark-manager/issues/5).

### The SPA is the OAuth client (PKCE S256); the API is a stateless Bearer resource server

- **Decision:**
  - **Sign-in:** the SPA runs Authorization Code + PKCE (S256) in the browser with `@auth0/auth0-react` and holds the tokens itself. `redirect_uri` is `http://localhost:3000/callback`, and the SPA requests `audience: https://bbl-candidate-test-api` and `scope: openid profile email`.
  - **API calls:** the SPA sends the access token to the API as `Authorization: Bearer <token>`.
  - **Where things run:** the SPA runs on `http://localhost:3000`, and the API on `http://localhost:3001`.
- **Why:**
  - **The tenant registers this client as a public SPA client,** so an in-browser PKCE flow is exactly what it's meant for, and the SDK hardcodes S256.
  - **The API only checks tokens.** It keeps no session store and has no cookies, so it needs no CSRF protection. "Every request carries a verified token" is also simple to test.
  - **Why PKCE, not the implicit flow:**
    - The implicit flow returns tokens in the URL fragment, where they can leak into browser history, logs and `Referer` headers.
    - An authorization code can be stolen too, but PKCE makes it useless without the verifier, which never leaves the browser tab.
    - The OAuth 2.0 Security Best Current Practice (RFC 9700) and OAuth 2.1 no longer allow the implicit flow.
    - This tenant refuses it anyway (`unauthorized_client`).
    - Auth0 doesn't *require* PKCE for this client, so the SPA always sending S256 is our responsibility. The SDK does this.
- **Rejected alternatives:**
  - **Backend-for-frontend (BFF),** a server on port 3000 that exchanges the code and gives the browser an `HttpOnly` session cookie. It would keep tokens away from JavaScript and survive reloads. The costs are:
    - a session store
    - CSRF protection
    - a proxy in front of the API
    - using a client registered as an SPA as a server-side client, which it wasn't designed for
  - **A Vite dev proxy that puts the API on the same origin.** It only exists in development, so it would hide the real two-origin, Bearer-token setup.
- **Consequences:**
  - The API allows CORS from exactly `http://localhost:3000`, with only the `Authorization` and `Content-Type` headers and the methods it serves, and without credentials. The rest of HTTP hardening is decided separately.
  - The SPA must be served on exactly `http://localhost:3000`.

### How the API checks the access token

- **Decision:**
  - **What's accepted:** the API accepts only the Auth0 **access token**, read from the `Authorization: Bearer` header. It never reads it from a query string or a cookie, and never accepts the ID token.
  - **How it's checked:** in a Nest guard, with `jose`'s `jwtVerify` and the tenant's published keys fetched with `createRemoteJWKSet`, using these rules:
    - `algorithms: ['RS256']` only
    - `issuer` must be exactly `https://dev-yg.us.auth0.com/`, trailing slash included
    - `audience` must be `https://bbl-candidate-test-api`. The token's `aud` is an array, and `jose` checks that it *contains* this value.
    - `exp` must hold, with a small clock tolerance
    - `sub` must be a non-empty string
  - **What isn't checked:** `azp` and `scope`. The format of `sub` isn't pinned either.
  - **Configuration:** the issuer, audience and key URL come from config.
  - **Result:** a valid token puts `sub` on the request as the Owner. Anything else gets a 401.
- **Why:**
  - **Pinning RS256** blocks tokens that switch the algorithm to fool the check, such as HS256 signed with the public key as the secret, or `alg: none`. This tenant lists HS256 for ID tokens, so this is a real risk.
  - **The exact `iss` and the audience check** make sure the token came from this tenant and was issued for this API.
  - **The API defines no permissions,** so there's nothing to check in `scope`.
  - **Which Owners exist is the data layer's concern,** not the guard's, so the guard doesn't check the format of `sub`.
- **Rejected alternatives:**
  - **Checking `azp` equals our client ID.** We chose to keep the rules to the standard ones.
  - **`passport-jwt` with `jwks-rsa`.** It has had no release since 2022.
  - **`express-oauth2-jwt-bearer`.** It's Express middleware that still depends on `jose@4`. See [#3](https://github.com/pnitijarasrat/bookmark-manager/issues/3).
- **Consequences:** a token that another app on this tenant got for the same audience would be accepted, and its `sub` would act as an Owner. That `sub` is still a real, signed-in Auth0 user of this tenant, and it only ever sees its own data. We accept this risk and state it here openly.

### Every API route requires a token

- **Decision:** a global Nest `APP_GUARD` runs the token check on every route. There is no `@Public()` decorator or other opt-out, and no unauthenticated route, not even a health check.
- **Why:** the brief asks for OIDC on every route. With deny-by-default and nothing that can opt out, a new route is protected without anyone having to remember it.
- **Rejected alternatives:**
  - **A public `/health`.** Docker Compose can check Postgres directly, and the API needs no health route for local development.
  - **A guarded catch-all so unknown paths also return 401.**
- **Consequences:**
  - Nest returns 404 for an unknown path before any guard runs, so an unauthenticated caller can tell which routes exist. We accept this, because the route list is in this public repo. The isolation promise is about Owners' data, not route names.
  - JSON bodies are parsed before the guard runs, so an unauthenticated request with malformed JSON gets a 400, not a 401. The 400 body is the constant problem+json and reveals nothing.
  - Tests swap the tenant's remote key set for an in-process one with two keys (the `JWKS` provider). That leaves the fetching of the real tenant's keys unproven, which a manual smoke run against the tenant covers ([#10](https://github.com/pnitijarasrat/bookmark-manager/issues/10)).

### Tokens are kept in memory only

- **Decision:** the SDK's default in-memory cache is used, with no `localStorage` cache and no `useRefreshTokens`.
- **Why:** no token is kept in storage that injected script could read.
- **Rejected alternatives:**
  - **`cacheLocation: 'localstorage'`.** The token would survive reloads, but a token with up to 2 hours left would sit in every tab where any XSS could read it.
  - **A custom `sessionStorage` cache.** It survives reloads within one tab only, and XSS can still read it.
  - **Refresh tokens or silent renewal.** Neither is available. There's no `offline_access`, and `prompt=none` returns `consent_required`, even from a top-level redirect. The likely cause is the `localhost` callback, which we can't change.
- **Consequences:** a reload or a new tab needs an interactive sign-in. This is a known cost, caused by tenant facts outside our control.

### How the SPA is wired up and the login page

- **Decision:**
  - **Router setup:** the React Router 8 data router is created inside a component under `<Auth0Provider>`, and passes `getAccessTokenSilently` to loaders and actions through the router context.
  - **The router-context API in 8.4 (checked in [#21](https://github.com/pnitijarasrat/bookmark-manager/issues/21)):** `createContext<T>()` makes a typed key. `createBrowserRouter(routes, { getContext })` takes a `getContext: () => RouterContextProvider`, and loaders, actions and middleware read the value with `context.get(key)`. Middleware is always on in v8 (no future flag). The installed `react-router@8.4.0` calls `getContext` again for **every navigation and every fetcher call** (`lib/router/router.js`), not once. So `frontend/src/App.tsx` builds one `AuthSession` object (`isAuthenticated`, `getAccessToken`, `clearSession`, made by `auth/auth0-session.ts`) when it creates the router, and `getContext` wraps it in a fresh provider each time. The router is made exactly once: `createBrowserRouter` starts loading straight away, and StrictMode calls a `useState` initializer twice in development, so the initializer only returns a getter that makes the router on first use (fixed after the review of [#21](https://github.com/pnitijarasrat/bookmark-manager/issues/21)). `createMemoryRouter` takes the same option, which the tests use to pass a fake session.
  - **Public routes:** only `/login` and `/callback`.
  - **`/login`:** shows the app name and a single "Sign in" button, which calls `loginWithRedirect`. The password is entered on Universal Login, never in our app.
  - **Signed-out visitors:** any other route sends them to `/login?returnTo=<path>`.
  - **`/callback`:** shows only a loading indicator. `onRedirectCallback` sends the user to `returnTo` if it's a relative path inside the app, and to `/bookmarks` otherwise (see [Default destination](#default-destination-is-bookmarks)).
  - **Signed-in users:** visiting `/login` sends them to `/bookmarks`.
- **Why:**
  - **Passing the getter explicitly** avoids hidden module state, and tests can pass a fake getter.
  - **An app-owned login page** gives signed-out visitors a clear page instead of an immediate redirect off the site.
  - **Only relative `returnTo` paths are accepted,** so the redirect can't be used to send users to another site.
- **Rejected alternatives:**
  - **Using `@auth0/auth0-spa-js` directly.**
  - **Saving the getter in a module variable.**
  - **Fetching data in components instead of loaders.**
  - **Sending signed-out visitors straight to Universal Login.**
  - **A login form in our own app.** The tenant refuses the password grant, so it isn't possible.
- **Consequences:** the frontend layout is described under [Frontend](#frontend).

### Logout

- **Decision:** logout calls `logout({ logoutParams: { returnTo: 'http://localhost:3000' } })`. The SPA passes `window.location.origin`, which is always that value because the dev server uses `strictPort`. This clears the in-memory cache and ends the Auth0 session through `/v2/logout`. The API does nothing on logout. After logout, `/` sends signed-out visitors to `/login`.
- **Why:** the return URL is fixed by the tenant, and a stateless API has no session to end.
- **Rejected alternatives:** a server-side token denylist. It would need state and a store, just to handle tokens that expire within 2 hours anyway.
- **Consequences:** an access token copied before logout keeps working until its `exp`, at most 2 hours later. Auth0 JWT access tokens can't be revoked, and we accept this.

Token expiry and 401 handling in the SPA is decided under [Frontend](#an-expired-session-sends-the-user-back-to-login).

---

## Isolation

Decided in [#7](https://github.com/pnitijarasrat/bookmark-manager/issues/7). How isolation is proven is decided in [#10](https://github.com/pnitijarasrat/bookmark-manager/issues/10).

### Another Owner's ID is always a 404

- **Decision:**
  - **The rule:** an ID that belongs to another Owner is treated exactly like one that doesn't exist, wherever it appears. The answer is always 404, never 403. This covers:
    - a path ID in GET, PUT, PATCH or DELETE on `/bookmarks/:id`, `/collections/:id` and `/collections/:id/bookmarks`
    - a `collectionId` used as a list filter. A filter naming a Collection you don't own gets a 404, not an empty list.
    - a `collectionId` in a Bookmark's create, PUT or PATCH body
  - **Malformed IDs:** a path ID that isn't a UUID also gets a 404, from a pipe, before any query runs.
  - **The body:** every 404 is the same constant `application/problem+json` body, `{"type":"about:blank","title":"Not Found","status":404}`. It has no `detail` and no `instance`, and never repeats the path or the ID. One exception filter produces it for every not-found case, including Nest's 404 for unknown routes.
- **Why:**
  - **A 403 would confirm that the resource exists,** which breaks the promise that a User can't learn of another Owner's data.
  - **One rule with no exceptions** is simple to state, build and test.
  - **A constant body** can be checked byte for byte. The archived attempt repeated the path in `instance`, which would have made its "identical 404" test fail.
  - **Rejecting malformed IDs early** stops Postgres from throwing on the cast to `uuid`.
- **Rejected alternatives:**
  - **403 for resources that exist but belong to someone else.**
  - **An empty `200` list for a filter on a Collection you don't own.**
  - **A 422 on the `collectionId` field** for a Bookmark body naming a Collection you don't own.
  - **A 400 from `ParseUUIDPipe`** for malformed IDs.
- **Consequences:**
  - The SPA maps a 404 caused by `collectionId` to a field error (see [How errors are shown](#how-errors-are-shown)).
  - The format of other errors (400, 415, 409, 422, 500) is decided under [API contract](#errors-are-problemjson-with-400-for-malformed-requests-and-422-for-invalid-values).

### The Owner scope lives in a repository layer

- **Decision:**
  - **Repositories:** every repository method takes the Owner as its first argument, `method(ownerId, …)`, and every query filters on it.
  - **How the Owner gets there:** the guard puts `sub` on the request. Controllers read it with an `@Owner()` parameter decorator and pass it on explicitly through services.
  - **Reads:** each read is one query on `id AND owner_id`.
  - **Writes:** Collection and Bookmark both have `@@unique([id, ownerId])`. Single-row updates and deletes use `where: { id_ownerId: { id, ownerId } }`, and the repository maps Prisma's `P2025` (record not found) to the standard 404.
  - **The boundary:**
    - An ESLint `no-restricted-imports` rule, run in CI, lets only `*.repository.ts` files import `PrismaService`, any `@prisma/*` package, `pg`, or the generated client (`src/generated/prisma`, where Prisma 7 puts it). Inline `eslint-disable` comments are turned off, so every exemption is listed in `eslint.config.js`, and a test lints sample files to prove the rule.
    - `PrismaModule` is imported only by the repository modules.
- **Why:**
  - **The Owner is visible at every call,** and tests can pass it as a plain argument.
  - **The lint rule makes the boundary mechanical,** not a matter of review, and gives [#10](https://github.com/pnitijarasrat/bookmark-manager/issues/10) something structural to point to.
  - **A composite unique `where`** makes each write one atomic, Owner-scoped query that returns the updated row, with no gap between checking and writing.
- **Rejected alternatives:**
  - **Postgres row-level security,** alone or alongside the repository. It's the only option where a forgotten filter still returns nothing. But every request would need a transaction that sets `app.owner_id`, the app would need a separate restricted database role (plus `FORCE ROW LEVEL SECURITY`), and the RLS setup would need its own tests. We chose to keep enforcement in one readable layer.
  - **A Prisma client extension that injects `ownerId`.** Query extensions don't reach nested writes or `$queryRaw`, so it leaves gaps and hides the scope.
  - **A request-scoped repository that reads the Owner from the request.** It hides the argument and makes every provider in the chain request-scoped.
  - **`updateMany` or `deleteMany` with a count check.** `updateMany` can't return the row, so this needs a second read.
  - **Code review, or Nest module structure alone,** as the boundary.
- **Consequences:**
  - The guarantee depends on every repository query including `ownerId`. The lint rule keeps Prisma inside the repositories, and [#10](https://github.com/pnitijarasrat/bookmark-manager/issues/10) proves the repositories themselves.
  - The seed script uses Prisma outside a repository, so it needs a lint exemption. So do `prisma.service.ts` and `prisma.module.ts`, which define the client the repositories use, and two tests of the database layer itself: `prisma.service.spec.ts` and `test/migrations.spec.ts`. No other file is exempt.

### IDs are database-generated UUIDv4

- **Decision:** every ID is a UUIDv4 in a native `uuid` column, generated with `@default(dbgenerated("gen_random_uuid()"))`.
- **Why:** random IDs reveal no counts, can't be enumerated, and carry no creation time.
- **Rejected alternatives:**
  - **Sequential integers.** They leak how many rows exist and invite enumeration.
  - **UUIDv7.** Its index benefit doesn't matter at this scale, and it contains the creation time.
  - **cuid2.** It needs an extra library and has no native Postgres type.
- **Consequences:** none.

### Collection names are `citext`

Decided in [#24](https://github.com/pnitijarasrat/bookmark-manager/issues/24).

- **Decision:** `collections.name` is a `citext` column (`@db.Citext`), with `@@unique([ownerId, name])`. The first migration runs `CREATE EXTENSION IF NOT EXISTS citext`.
- **Why:**
  - **One column does both jobs:** the unique index ignores case, and `orderBy: { name }` sorts ignoring case, so the `lower(name) asc, id asc` order needs no raw SQL.
  - **Prisma's schema expresses it fully,** so it adds no drift. Prisma doesn't manage extensions without a preview feature, so the hand-added `CREATE EXTENSION` isn't seen as drift either.
- **Rejected alternatives:**
  - **A generated `lower(name)` sort-key column.** Prisma 7 can't declare a generated column, so it would be hand-edited SQL that Prisma sees as drift, or a field Prisma tries to write.
  - **The `postgresqlExtensions` preview feature.** A preview feature for one line of SQL.
- **Consequences:** `citext` compares with `lower()`, which is the same rule as the documented `lower(name)` sort.

### A Bookmark's Collection always has the same Owner

- **Decision:**
  - **The check:** before a Bookmark write with a `collectionId`, the repository looks the Collection up, scoped to the Owner, and answers 404 if it isn't found.
  - **The constraint:** a composite foreign key, `Bookmark(collection_id, owner_id) → Collection(id, owner_id)`, backed by the unique key on `Collection(id, owner_id)`. It is `ON UPDATE NO ACTION`, because an Owner never changes.
  - **The race:** if the Collection is deleted between the check and the write, the foreign key fails with `P2003`, and the repository maps that to the same 404.
  - **Other database errors:** any unmapped Prisma error becomes a generic 500 whose body contains no database details.
- **Why:**
  - **The check** gives a clean, identical 404.
  - **The foreign key** keeps the rule true even if some code path skips the check.
- **Rejected alternatives:** only the application check, or only the foreign key.
- **Consequences:** deleting a Collection sets its Bookmarks' `collectionId` to null (see [Deleting a Collection keeps its Bookmarks](#deleting-a-collection-keeps-its-bookmarks)), and a plain composite foreign key would null `owner_id` too. The migration must be hand-edited to `ON DELETE SET NULL (collection_id)` (Postgres 15+), which Prisma's schema can't express.

### Clients can never set or see `ownerId`

- **Decision:**
  - **Requests:** the global `ValidationPipe` runs with `whitelist: true` and `forbidNonWhitelisted: true`. No request DTO has an `ownerId` field, so a body containing one gets a 400.
  - **Responses:** `ownerId` is left out of all responses.
- **Why:**
  - **A 400 tells a client** that thinks it can set the Owner that it can't.
  - **In a response, `ownerId`** would always be the caller's own `sub`, so it tells them nothing. Leaving it out keeps `sub` values out of the API's responses.
- **Rejected alternatives:** silently stripping unknown fields.
- **Consequences:** any unknown field gets a 400, not only `ownerId`.

### Side channels

- **Decision:**
  - **Error bodies:** 404 bodies are constant (see [above](#another-owners-id-is-always-a-404)).
  - **Timing:** a lookup is one query on `id AND owner_id`, so a resource that doesn't exist and one that belongs to someone else take the same code path. There's no fetch-then-compare.
  - **Uniqueness:** any unique constraint on user content is scoped per Owner, so a 409 can never reveal another Owner's data.
- **Why:** these are the ways a User could otherwise tell "doesn't exist" apart from "belongs to someone else".
- **Rejected alternatives:** artificial delays to even out timing. Both cases already run the same single query.
- **Consequences:** logging and rate limiting are decided under HTTP hardening.

---

## Frontend

Decided in [#12](https://github.com/pnitijarasrat/bookmark-manager/issues/12).

### Data goes through loaders and actions only, with no client cache

- **Decision:** React Router 8 loaders read data and actions write it. After every successful action, the router reloads the data for the current page. A failed action returns its result with an error status (the API's, or 503 when no response came back), and React Router skips the reload after any action status of 400 or above. So a rejected save leaves the list behind the dialog, and its Load more pages, as they were. Pending states come from `useNavigation` and `useFetcher`. No client-side cache library is used.
- **Why:** the data is small and belongs to one User, so reloading after each action is cheap, and it is correct without extra work. A second cache would need its own invalidation rules, which is a common source of stale-data bugs.
- **Rejected alternatives:** **TanStack Query** as a cache behind the loaders, or instead of them.
- **Consequences:** every write is followed by a refetch of the current page's data. At this scale we accept the extra requests.

### Routes: the lists are pages, and everything else opens in a dialog

- **Decision:**
  - **Protected routes:** they all sit under one pathless layout route (see the next section).
  - **Pages:** `/bookmarks` and `/collections` are the only full pages.
  - **Details:** `/bookmarks/:id` is a child route of `/bookmarks`, and `/collections/:id` a child route of `/collections`. Each opens as an MUI Dialog over its list, and goes full-screen on small screens. Closing the dialog goes back to the parent list.
  - **Creating:** a "New" button opens a Dialog that submits through a fetcher to the list route's action. There is no `/new` route.
- **Why:**
  - **The list stays visible,** keeping its scroll position and filters.
  - **Every detail still has its own URL,** so it can be linked to and works with back and forward.
  - **A Dialog manages focus and keyboard access for us,** on both desktop and phone.
- **Rejected alternatives:**
  - **Full detail pages.**
  - **A side Drawer.**
  - **A mix, with `/collections/:id` as a full page.**
- **Consequences:** detail routes need their parent list's layout to render, and a deep link to `/bookmarks/:id` loads the list as well.

### The route guard is layout-route middleware

- **Decision:**
  - **Waiting for Auth0:** the router isn't created until Auth0's `isLoading` is false. Until then, a full-screen spinner is shown.
  - **Passing auth state:** `isAuthenticated` is passed through the router context, next to the token getter.
  - **The check:** middleware on the pathless protected layout route throws `redirect('/login?returnTo=<path>')` for signed-out visitors. If RR 8.4's middleware API doesn't fit, a parent loader does the same job.
- **Why:**
  - **Every protected loader runs after the guard,** so no loader runs without a token.
  - **The check lives in one place,** so a new protected route is covered without anyone having to remember it.
  - **Tests can pass a fake context.**
- **Rejected alternatives:** a `<RequireAuth>` wrapper component. Loaders run before components render, so it can't stop them from running.
- **Consequences:**
  - The app's first render waits for the Auth0 SDK to finish loading.
  - RR 8.4's middleware fitted, so no parent-loader fallback was needed.
  - `isAuthenticated` only changes while the router exists when a session ends, because signing in always leaves the page. `clearSession` sets it to `false` itself before calling `logout({ openUrl: false })`, so `/login` doesn't send the User back to a page whose token has already failed.

### An expired session sends the user back to `/login`

- **Decision:** one `apiFetch` helper attaches the Bearer token to every request. The redirect is triggered in two cases:
  - `getAccessTokenSilently` throws an error that means the session has ended: Auth0's `login_required`, `consent_required`, `interaction_required`, `missing_refresh_token` or `invalid_grant`, or it returns no token. `auth/auth0-session.ts` turns these into a `SessionEndedError`.
  - The API returns 401.

  In either case, the helper clears the local auth state and throws a redirect to `/login?returnTo=<current path>&reason=expired`. `/login` then shows "Your session expired, sign in again". The `returnTo` path never includes a Load more `cursor`.

  Any other token failure, like a timeout or being offline, is passed on as it is. A loader shows it in the error boundary with "Try again", and an action shows "Couldn't reach the server" in a Snackbar. The User stays signed in.

  Any other error status is thrown as a `Response` to the route error boundary, unless the caller lists it in `allow`. Actions pass `allow: 'all'` and turn the answer into field errors or a Snackbar. A 401 is never returned to a caller.
- **Why:**
  - **Expiry is certain:** tokens live in memory only, last 2 hours, and can't be renewed silently (see [Auth](#tokens-are-kept-in-memory-only)).
  - **The user isn't sent off-site without warning,** matching the settled login-page decision.
  - **One helper** handles both failure paths.
- **Rejected alternatives:**
  - **Calling `loginWithRedirect` immediately.**
  - **A re-login modal over the current page.**
- **Consequences:** a half-filled form is lost when the session expires. We accept this.

### How errors are shown

- **Decision:**
  - **404:** `apiFetch` throws a 404 response. The route error boundary shows a "Not found" page with a link back to the list.
  - **5xx or network failure:** an error boundary with "Try again", which reloads the data.
  - **Failed actions:** a 422 is returned as action data and shown next to the form fields. A 404 on a Bookmark submission that included a `collectionId` shows "Collection not found" on the Collection picker, because the API answers 404 for a Collection that doesn't exist or isn't yours (see [Isolation](#another-owners-id-is-always-a-404)). A 404 on the Bookmark's own ID still goes to the error boundary. Any other failure shows a Snackbar.
- **Why:** the API answers 404 for another Owner's resource too, so the SPA shows the same page for both. That page reveals nothing about whether the resource exists.
- **Rejected alternatives:** separate "forbidden" and "not found" messages.
- **Consequences:**
  - The SPA can't tell a mistyped ID from someone else's resource, which is intended.
  - A PUT to `/bookmarks/:id` that sends a `collectionId` and gets a 404 doesn't say which ID was missing. The action then re-reads `GET /bookmarks/:id`. A 404 there goes to the error boundary. Otherwise the picker shows "Collection not found". A create has no Bookmark ID, so its 404 is the Collection's when it sent one, and goes to the error boundary when it didn't.
  - A 409 on a Collection name is shown next to the name field, not in a Snackbar.

### API types are generated from OpenAPI

- **Decision:**
  - **Spec:** the API produces an OpenAPI spec with `@nestjs/swagger` and its CLI plugin.
  - **Frontend:** the SPA generates types from it with `openapi-typescript` and calls the API through `openapi-fetch`, wrapped by `apiFetch`.
  - **CI:** a check fails if the committed spec is out of date.
- **Why:**
  - **The API is the single source of truth.**
  - **The spec also documents the API for reviewers.**
  - **Request paths and bodies are type-checked.**
  - **No monorepo is needed.**
- **Rejected alternatives:**
  - **A shared zod schema package.** It would tie the SPA to the API's validation library.
  - **Hand-written types in both apps.** The two copies drift apart.
- **Consequences:**
  - A change to the API contract needs the spec and the types regenerated: `npm run openapi` in `backend/`, then `npm run api-types` in `frontend/`. CI runs `npm run api-types:check`.
  - `openapi-typescript` 7.13.0 declares a peer dependency on TypeScript `^5`. `frontend/package.json` overrides it to our pinned 6.0.3, which still ships the compiler API that it uses (7.0 is the release without one).

### What the dialogs contain

- **Decision:**
  - **Collection dialog:**
    - a rename form
    - a read-only list of the Collection's Bookmarks from `GET /collections/:id/bookmarks`, each linking to `/bookmarks/:id` (following one closes this dialog and opens that one)
    - a Delete button that always asks for confirmation, and says how many Bookmarks will be kept as Uncategorised (see [Deleting a Collection keeps its Bookmarks](#deleting-a-collection-keeps-its-bookmarks))
  - **Bookmark dialog:**
    - **Fields:** the edit form opens straight away.
    - **Collection picker:** a Select listing the User's Collections, with "None (Uncategorised)" as the first option.
    - **Buttons:** Save, Delete, Close, and "Open link", which opens the URL in a new tab with `rel="noopener noreferrer"`.
    - **Where the Collection list comes from:** the `/bookmarks` loader loads it next to the Bookmarks.
  - **Deleting a Bookmark:** asks for confirmation first.
  - **A failed delete:** the confirmation closes, and the error shows in the dialog's Snackbar.
  - **After a successful save:** the dialog closes and the list reloads.
- **Why:**
  - **The Collection dialog** gives the brief's `GET /collections/:id/bookmarks` a real place in the UI, without dialogs opening on top of dialogs.
  - **A Bookmark has little to show beyond its fields,** so a single edit mode is simpler.
  - **Deletion has no undo,** so it asks first.
- **Rejected alternatives:**
  - **A Collection dialog with only a rename field.**
  - **An editable Bookmark list inside the Collection dialog.**
  - **A read-only Bookmark view with a separate Edit mode.**
  - **An undo Snackbar instead of a delete confirmation.**
- **Consequences:**
  - The Collection dialog lists the first 100 of the Collection's Bookmarks (one API page), then says how many more there are. The full, filterable list is `/bookmarks?collectionId=<id>`.
  - The dialogs save with PUT, so "None" is sent as `collectionId: null` (see [API contract](#put-replaces-patch-updates-and-the-spa-uses-put)).

### The app shell

- **Decision:**
  - **Top bar:** an MUI AppBar with the app name and two tabs, "Bookmarks" and "Collections", linked to their routes.
  - **Right side:** the signed-in email as plain text, loaded from `/me` by the layout route's loader, and a "Sign out" button that calls the logout described in [Logout](#logout).
  - There is no avatar.
- **Why:**
  - **Showing who is signed in** makes the isolation demo with two seeded Owners easy to follow.
  - **It gives `/me` a real use** in the app.
  - **An avatar adds nothing.**
- **Rejected alternatives:**
  - **An avatar menu.**
  - **A shell that never calls `/me`.**
- **Consequences:** the shell shows only `email` from `/me` (see [/me comes from /userinfo](#me-comes-from-userinfo-cached-until-the-token-expires)). If `/me` fails, the email is left out and the rest of the shell still works.

### Default destination is `/bookmarks`

- **Decision:** one constant, `DEFAULT_ROUTE = '/bookmarks'`, is used in three places:
  - `/` redirects there.
  - `/callback` uses it when there's no valid `returnTo`.
  - A signed-in user visiting `/login` is sent there.
- **Why:** saving and finding links is the main task, and Collections are only a way of organising them.
- **Rejected alternatives:** `/collections` as the landing page.
- **Consequences:** none.

### Filters live in the URL

- **Decision:** the `/bookmarks` filters are kept in URL search params, which the loader reads and passes on to the API. The params stay in the URL while a Bookmark dialog opens and closes.
- **Why:**
  - **A filtered view can be linked to** and survives back and forward.
  - **Closing a dialog** goes back to the same filtered list.
- **Rejected alternatives:** filter state kept in React state.
- **Consequences:**
  - `/collections` keeps its name search in `q` the same way.
  - The filter options, param names and pagination UI are decided under [API contract](#lists-use-cursor-pagination-with-a-fixed-sort).

---

## API contract

Decided in [#8](https://github.com/pnitijarasrat/bookmark-manager/issues/8). The contract itself, with every route, field and status code, is in [API_DESIGN.md](API_DESIGN.md). This section records why it looks that way.

### Changes from the brief's suggested shapes

- **Decision:** the brief suggests:
  - **Collection:** `id, name, ownerId, createdAt, updatedAt`
  - **Bookmark:** `id, url, title, notes?, collectionId?, ownerId, createdAt, updatedAt`

  We keep these shapes, with three changes:
  - `ownerId` is stored but left out of every response, and a request body containing it gets a 400.
  - A Collection response adds `bookmarkCount`, the number of the Owner's Bookmarks in that Collection.
  - `notes` is optional in a request, but it's always a string in the database and in responses. It defaults to `""` and is never `null`.
- **Why:**
  - **`ownerId`:** see [Clients can never set or see `ownerId`](#clients-can-never-set-or-see-ownerid).
  - **`bookmarkCount`:**
    - The Collections page can show counts.
    - The delete-Collection warning can say how many Bookmarks are affected without another request (see [Deleting a Collection keeps its Bookmarks](#deleting-a-collection-keeps-its-bookmarks)).
    - It's one `_count` in the same Owner-scoped query.
  - **`notes`:** a nullable string has two empty states, `null` and `""`. That makes "clear the notes" in a PATCH ambiguous, and every reader would need to handle both.
- **Rejected alternatives:**
  - **Keeping `ownerId` in responses.**
  - **`notes: string | null`.**
  - **Embedding `collection: {id, name}` in a Bookmark.** The `/bookmarks` loader already loads the Collection list, and embedding it would make the read shape differ from the write shape.
- **Consequences:** `collectionId` stays optional in the sense the brief means: it's `null` for an Uncategorised Bookmark, and a create body can leave it out.

### Field rules

- **Decision:**
  - **`url`:**
    - It's trimmed, then parsed with the WHATWG `URL` parser.
    - Only `http:` and `https:` are accepted, it must have a host, and it can be at most 2048 characters.
    - It's stored as entered, with no normalisation.
    - The same URL can be saved more than once by the same Owner.
  - **`title`:** required, trimmed, 1–200 characters.
  - **`notes`:** at most 2000 characters, stored exactly as sent, and `""` by default.
  - **`name`:** required, trimmed, 1–100 characters, and unique per Owner regardless of case. A clash gets a 409.
  - **`collectionId`:** a UUID or `null`.
  - **`createdAt` and `updatedAt`:** always set by the server, and returned as ISO 8601 in UTC. A client that sends them gets a 400.
- **Why:**
  - **Allowing only http(s)** keeps `javascript:` and `data:` URLs out of the "Open link" button.
  - **2048 characters** is the usual practical limit for URLs.
  - **Storing the URL as entered** keeps what the User typed.
  - **Allowing duplicates:**
    - A read-later list can reasonably hold the same link twice, for example with different notes.
    - An exact-match check is easy to get around, and normalising URLs isn't asked for.
  - **A required title:** we don't fetch page titles (out of scope), so the list always has something readable to show, and the field has a single state.
  - **Case-insensitive names:** "Reading" and "reading" side by side in the Collection picker would only confuse the User. The uniqueness is per Owner, so a 409 reveals nothing about anyone else (see [Side channels](#side-channels)).
- **Rejected alternatives:**
  - **Any string as a URL.**
  - **Normalising URLs,** such as lowercasing the host or stripping the fragment.
  - **Rejecting duplicate URLs with a 409.**
  - **An optional title,** or copying the URL into it.
  - **Names that aren't unique,** or unique only with matching case.
  - **Leaving timestamps out of responses.**
- **Consequences:**
  - **Name uniqueness** is a unique index on `(owner_id, name)`, with `name` stored as `citext` (see [Collection names are `citext`](#collection-names-are-citext)). The migration enables the `citext` extension by hand.
  - **A whitespace-only `title` or `name`** gets a 422, because trimming happens before validation.

### PUT replaces, PATCH updates, and the SPA uses PUT

- **Decision:**
  - **POST:** creates a resource.
    - **Bookmark:** `url` and `title` are required. `notes` defaults to `""`, and `collectionId` defaults to `null`.
    - **Collection:** `name` is required.
  - **PUT:** a full replace, so every writable field is required. For a Bookmark that means `url`, `title`, `notes` and `collectionId`, which must be sent explicitly, even as `null`. PUT never creates, so a missing ID gets a 404.
  - **PATCH:** a partial update with a plain `application/json` body.
    - An absent field stays unchanged.
    - `collectionId: null` makes the Bookmark Uncategorised.
    - `null` for any other field gets a 422.
    - `{}` is a 200 that changes nothing.
  - **Collections:** the only writable field is `name`, so PUT and PATCH behave the same.
  - **The SPA:** both edit dialogs save with PUT, and the Collection picker's "None (Uncategorised)" is sent as `collectionId: null`.
- **Why:**
  - **PATCH keeps "absent" and `null` apart,** which is all that moving a Bookmark to Uncategorised needs.
  - **The dialogs always hold the whole resource,** so PUT matches what they send and makes "None" explicit.
  - **PATCH stays in the API** because the brief asks for it.
- **Rejected alternatives:**
  - **JSON Merge Patch (RFC 7396)** or **JSON Patch (RFC 6902)** for PATCH.
  - **PUT that creates a resource** when the ID doesn't exist.
  - **The SPA sending only the fields that changed,** with PATCH.
- **Consequences:** `updatedAt` changes even when a PUT or PATCH changes nothing.

### Errors are problem+json, with 400 for malformed requests and 422 for invalid values

- **Decision:** every error is `application/problem+json` (RFC 9457).
  - **400:** the request is malformed:
    - malformed JSON
    - an unknown or forbidden body field
    - an unknown or invalid query parameter
    - an invalid `limit` or `cursor`
  - **415:** a write whose `Content-Type` isn't `application/json`.
  - **422:** the request is well-formed but holds invalid values, such as a wrong type, a bad length or a URL scheme that isn't allowed. The body adds `errors: [{ "pointer": "/url", "detail": "…" }]`, where each pointer is a JSON Pointer into the request body.
  - **409:** a Collection name that's already in use.
  - **404:** the constant body from [Isolation](#another-owners-id-is-always-a-404).
  - **401:** from the guard.
  - **500:** a generic body with no details.
  - **Successes:** `201` with a `Location` header for creates, `200` with the body for PUT and PATCH, and `204` for DELETE. A second DELETE of the same ID gets a 404.
- **Why:**
  - **The SPA already shows 422 errors next to the form fields,** and JSON Pointers map directly to those fields.
  - **A 400 means the client is broken.** A 422 means the User typed something wrong.
  - **One format for every error** keeps the SPA's error handling in one place.
- **Rejected alternatives:**
  - **Nest's default `{statusCode, message[], error}`.**
  - **A single 400 for everything.**
  - **Accepting any `Content-Type`.**
- **Consequences:**
  - **Telling 400 from 422:** in a body, the `ValidationPipe`'s `exceptionFactory` sends class-validator's `whitelistValidation` failures to 400 and every other failure to 422. In a query string, every failure is a 400, because the SPA's code builds the query and the User doesn't type it.
  - **The 415 check needs its own code.** Express's JSON parser ignores bodies that aren't JSON, and without the check they would show up as 422 "missing field" errors.

### Lists use cursor pagination with a fixed sort

- **Decision:**
  - **Parameters:** `?limit=&cursor=`. `limit` is an integer from 1 to 100 and defaults to 50.
  - **Response:** `{ "items": [...], "nextCursor": string | null }`.
  - **The cursor:**
    - It's the last item's sort key plus its `id`, encoded as base64url JSON.
    - It's unsigned, and clients treat it as opaque.
    - It isn't tied to the filters it was issued with.
    - A cursor that can't be decoded gets a 400.
  - **Sort order:** fixed.
    - **Bookmarks:** newest first, by `createdAt desc, id desc`.
    - **Collections:** by `lower(name) asc, id asc`.
  - **The SPA:**
    - A "Load more" button uses a fetcher to add the next page to the list.
    - The cursor never goes in the URL, so a reload or a shared link shows the first page. That includes the `returnTo` path an expired session saves.
    - Both `/bookmarks` and `/collections` work this way.
- **Why:**
  - **Keyset pages don't shift** when items are added or deleted between requests, and there's no `COUNT(*)` query.
  - **An unbounded list is never acceptable,** even at this scale.
  - **Signing the cursor adds nothing.** It only positions a query that's already Owner-scoped, so a forged cursor can't reach another Owner's rows.
  - **A cursor in the URL** would make links that break once the list changes.
  - **The brief doesn't ask for sorting.**
- **Rejected alternatives:**
  - **Offset pagination with a `total` count and page numbers.**
  - **No pagination.**
  - **A cursor signed with an HMAC.**
  - **A bare array with a `Link` header.**
  - **Client-chosen `?sort=`.**
- **Consequences:**
  - **`createdAt` is stored as `timestamptz(3)`.** A JavaScript `Date` holds only milliseconds, so the column must match. Otherwise a cursor taken from a row with microsecond precision would skip or repeat rows.
  - **Prisma's `orderBy` can't sort on `lower(name)`,** so `name` is a `citext` column, which sorts and compares ignoring case (see [Collection names are `citext`](#collection-names-are-citext)).

### Filters and the nested Collection route

- **Decision:**
  - **`GET /bookmarks`:**
    - **`collectionId=<uuid>`:** the Bookmarks in that Collection. A Collection that doesn't exist or isn't yours gets a 404.
    - **`collectionId=none`:** only Uncategorised Bookmarks.
    - **Anything else in `collectionId`:** a 404.
    - **`q`:** a case-insensitive substring match over `title` and `url`.
  - **`GET /collections`:** `q` matches the name.
  - **`q` in both:**
    - It's trimmed and at most 200 characters.
    - An empty `q` counts as absent.
    - `%`, `_` and `\` are matched literally.
  - **`GET /collections/:id/bookmarks`:**
    - It's the same service call as `GET /bookmarks?collectionId=:id`, with the same `q`, pagination, sort and 404.
    - Sending `collectionId` to it gets a 400.
  - **The SPA's `/bookmarks` URL:** uses the API's own parameter names, `?collectionId=&q=`, and the loader passes them through unchanged.
- **Why:**
  - **`none`** means Uncategorised needs no second parameter that could clash with `collectionId`.
  - **A 404 for a malformed `collectionId`** means every bad Collection reference in the API gets the same answer.
  - **One code path** makes the brief's nested route a thin alias.
  - **Matching parameter names** means the SPA needs no mapping layer.
- **Rejected alternatives:**
  - **A separate `uncategorised=true` parameter.**
  - **A 400 for a malformed `collectionId`.**
  - **Date-range filters.**
  - **Searching `notes`.**
  - **An unpaginated nested route.**
  - **Friendlier names in the SPA's URL.**
- **Consequences:** the brief's "filter" requirement is covered by `collectionId` and `q` alone.

### Deleting a Collection keeps its Bookmarks

Decided in [#9](https://github.com/pnitijarasrat/bookmark-manager/issues/9).

- **Decision:**
  - **The Bookmarks:** deleting a Collection makes its Bookmarks Uncategorised (`collectionId: null`). It never deletes a Bookmark.
  - **Where it happens:** in the database. The composite foreign key is hand-edited in the migration to `ON DELETE SET NULL (collection_id)` (Postgres 15+), so `owner_id` is never nulled. The repository runs a single `delete({ where: { id_ownerId: { id, ownerId } } })`, and Prisma's `P2025` becomes the standard 404.
  - **Hard delete, no undo:** the row is removed. There's no `deletedAt` column and no undo.
  - **The API:** `DELETE /collections/:id` answers `204` with no body. The only errors are `401` and `404`. A second DELETE of the same ID gets a `404`.
  - **The SPA:** the Delete button in the Collection dialog always asks for confirmation, even for an empty Collection:
    - **Title:** `Delete Collection "Reading"?`
    - **Extra line, when `bookmarkCount` is above 0:** `Its 3 Bookmarks will be kept and become Uncategorised.`
    - **Buttons:** Cancel and Delete (red).
    - **After a delete:** the action redirects to `/collections`, which closes the dialog and reloads the list. There's no success Snackbar. A 404 goes to the error boundary, and any other failure shows a Snackbar (see [How errors are shown](#how-errors-are-shown)).
- **Why:**
  - **A Collection organises Bookmarks; it doesn't own them.** The data model already allows a Bookmark in no Collection, so Uncategorised is a normal state.
  - **Deleting a Collection should never lose saved links.** The User may only want to reorganise.
  - **Nothing is lost, so a confirmation is enough and no undo is needed.** The User can move the Bookmarks into another Collection afterwards.
  - **The foreign key does the work in one atomic statement.** A Bookmark saved into the Collection at the same moment fails the foreign key (`P2003`), which is already mapped to a 404 (see [A Bookmark's Collection always has the same Owner](#a-bookmarks-collection-always-has-the-same-owner)).
  - **The warning says "kept"** because the User's real worry is losing their links. The count comes from the loaded Collection, so no extra request is needed.
- **Rejected alternatives:**
  - **Cascade:** one click could silently destroy many links, and they can't be restored.
  - **Refusing a non-empty Collection:** the User would have to move every Bookmark by hand first, one dialog at a time, because the Collection dialog's Bookmark list is read-only.
  - **Letting the client choose** (for example `?bookmarks=keep|delete`): it doubles the API surface and the isolation tests for a choice the brief doesn't ask for.
  - **Soft delete with an undo Snackbar:** every Owner-scoped query would need a `deletedAt` filter, which is one more way to leak data. It would also need a partial unique index for names, and a record of which Bookmarks to put back.
  - **Undo by re-creating the Collection:** it would get a new ID and `createdAt`, and the SPA would have to re-assign every Bookmark.
  - **Set-null in application code** (`updateMany`, then `delete`, in a transaction): two statements, with a race between them, where one foreign-key rule does the same job atomically.
  - **No confirmation for an empty Collection,** and **generic warning text without a count.**
- **Consequences:**
  - **A hand-edited migration:** Prisma's schema can't express `SET NULL (collection_id)`. The schema says `onDelete: SetNull` (Prisma warns about the required `ownerId`, which is expected), and the migration adds the column list. Checked in [#24](https://github.com/pnitijarasrat/bookmark-manager/issues/24): Prisma's introspection sees both as `SET NULL`, so a second `prisma migrate dev` reports no drift and no workaround is needed. A migration test deletes a Collection and checks that its Bookmarks keep their `owner_id` and have `collection_id = null`, and another runs `prisma migrate diff --exit-code` to keep the no-drift result true.
  - **`updatedAt` stays the same** on the moved Bookmarks, because Prisma's `@updatedAt` only changes when Prisma writes the row. Nothing sorts or filters by `updatedAt`, and the User didn't edit those Bookmarks.
  - **The count in the warning can be slightly out of date** if another tab changed the Collection. No data is lost either way.
  - **Stale references in other tabs are already covered:** a Bookmark dialog that still lists the deleted Collection gets "Collection not found" on save, and a `/bookmarks?collectionId=<deleted>` URL shows the Not-found page.
  - **The Bookmark delete confirmation stays,** because there's still no undo.
  - **Tests for the isolation proof** ([#10](https://github.com/pnitijarasrat/bookmark-manager/issues/10)):
    1. Owner A deletes their own non-empty Collection: `204`, and its Bookmarks still exist, still belong to A, have `collectionId: null` and appear under `?collectionId=none`.
    2. Owner B deletes A's Collection: the constant 404, and A's Collection and Bookmarks are unchanged.
    3. Deleting A's Collection leaves B's Collections and Bookmarks unchanged.
    4. A second DELETE of the same ID gets a 404, and so does a non-UUID ID.
    5. The migration test above.

---

## Repo and tooling

Decided in the pre-build grilling session (2026-09-16), tracked in [#1](https://github.com/pnitijarasrat/bookmark-manager/issues/1).

### Layout

- **Decision:** the repo layout is fixed by the brief:
  - `backend/`: the NestJS API
  - `frontend/`: the Vite SPA
  - `transcripts/`: the agent session logs
  - `CLAUDE.md`: the agent rules
  - `DECISIONS.md`, `API_DESIGN.md` and `README.md` at the root

  The brief's `/.agent/` folder is `.claude/`, because that is the only folder Claude Code reads. Its shareable parts (`commands/`, `agents/`, `settings.json`, `.mcp.json`) are committed. `.claude/worktrees/` and `settings.local.json` are ignored.
- **Why:**
  - **The brief fixes the layout.**
  - **`backend/` and `frontend/` are separate packages** with no shared code. The API contract reaches the SPA through the generated OpenAPI spec (see [API types are generated from OpenAPI](#api-types-are-generated-from-openapi)).
- **Rejected alternatives:**
  - **An npm/pnpm workspace with a shared package.**
  - **A real `/.agent/` folder with a symlink to `.claude/`.** It's fragile, and the link breaks on some checkouts.
- **Consequences:** the README says that `.claude/` is the brief's `/.agent/`.

### One-command local development

- **Decision:**
  - **Database:** `docker-compose.yml` runs Postgres 17 as Compose project `bbl-bookmarks`, on host port `5434` (bound to `127.0.0.1`), so it doesn't clash with other local Postgres instances on 5432 or 5433.
  - **Start:** the root `package.json` holds only scripts. `npm run dev` starts Postgres, runs the Prisma migrations and the seed, then starts `backend` (`:3001`) and `frontend` (`:3000`) together with `concurrently`.
  - **Install:** `npm install` at the root copies `backend/.env.example` to `backend/.env` if it's missing, then installs the backend.
  - **Config:** each app has a committed `.env.example`, and real `.env` files are ignored. The backend's example values are the public tenant facts and the Compose database, so they work as they are. The API validates its config at startup and refuses to start if a value is missing or malformed.
  - **Node:** 24 LTS, pinned with `.nvmrc` and `engines`.
- **Why:**
  - **A reviewer can run everything with one command.**
  - **Postgres 15 or later is required** for `ON DELETE SET NULL (collection_id)`.
  - **Checking config at startup** turns a wrong issuer or audience into a clear startup error, not a stream of 401s.
- **Rejected alternatives:** running Postgres on the host, and starting each app by hand.
- **Consequences:** Docker is a prerequisite, and the README says so.

### Seed data

From [#11](https://github.com/pnitijarasrat/bookmark-manager/issues/11), built in [#20](https://github.com/pnitijarasrat/bookmark-manager/issues/20).

- **Decision:**
  - **Owners:**
    - **Owner A** is the tenant's real test user. The seed reads A's `sub` from `SEED_OWNER_A_SUB`, which is documented in `backend/.env.example` with no value. No real `sub` is committed.
    - **Owner B** is `auth0|000000000000000000000000`. B can never sign in, which is intended.
  - **Contents:**
    - **Collections:** each Owner gets two. Both Owners have a Collection with the same name in different casing (`Reading` for A, `reading` for B). One of each Owner's Collections has no Bookmarks.
    - **Bookmarks:** each Owner also gets some Uncategorised Bookmarks, and some URLs appear for both Owners.
    - **Owner B's text:** every title and note says outright that it belongs to B, for example "Owner B only: if you can see this, isolation is broken".
    - **A's large Collection:** about 55 Bookmarks in one Collection, so "Load more" shows up on `/bookmarks` and on that Collection's page. B keeps a small set.
    - **Order:** each row gets its own `createdAt`, one minute apart, so the list order is the same on every run.
  - **Code:** `backend/prisma/seed.ts` exports `seed(prisma, { ownerA, ownerB })`. A CLI entry point in the same file reads the environment and calls it. The seed runs as `prisma db seed` through `migrations.seed` in `prisma.config.ts`, through a pinned `tsx` (4.23.13). Node 24's built-in TypeScript support was tried first, but it can't resolve the generated client's `.js` imports. `whoami` imports no generated code, so it runs on plain `node`.
  - **Runs:**
    - **`npm run dev`** runs the migrations, then `db:seed`, then the apps.
    - **Empty Owners only:** `db:seed` seeds an Owner only if that Owner has no Collections and no Bookmarks. Otherwise it leaves that Owner alone.
    - **`SEED_OWNER_A_SUB` unset:** only B is seeded, and a message explains how to set the variable. A is seeded on the next run after the variable is set.
  - **Reset:** `npm run db:seed:reset` deletes and re-creates the rows of B, and of A if the variable is set, in one transaction. It touches no other Owner. It refuses to run unless `DATABASE_URL` points at the local Compose database (`localhost:5434`, or `127.0.0.1:5434`, which is the address Compose binds).
  - **Finding your `sub`:** `npm run whoami --prefix backend -- <token>` decodes an access token locally and prints only its `sub`. It doesn't verify the token. The reviewer copies the token from the `Authorization` header of any API request in the browser's Network tab.
  - **Seeing B's rows:** a `psql` command, run through `docker compose exec`, counts rows for each Owner. Until the README lands in [#23](https://github.com/pnitijarasrat/bookmark-manager/issues/23), it lives in the header comment of `backend/prisma/seed.ts`.
  - **Overlapping runs:** each run takes a per-Owner advisory lock (`pg_advisory_xact_lock`) inside its transaction, so two runs started together take turns. The second then sees the first's rows and leaves that Owner alone, instead of failing on the unique Collection name and stopping `npm run dev`.
- **Why:**
  - **Only one Owner can sign in.** Sign-up is disabled, and the tenant has one test user (see [Universal Login with existing database users](#universal-login-with-existing-database-users-no-offline_access)). B exists to show, in the database, that data A must never see is really there.
  - **Keeping the `sub` in an environment variable** keeps real account identifiers out of this public repo, as the research docs already do.
  - **Seeding only empty Owners** means a fresh clone shows the demo, and restarting `dev` never wipes what the reviewer created.
  - **Leaks are easy to spot:** a shared Collection name, shared URLs and text that names B mean any leak shows up at once, both in the UI and in a search.
  - **Exporting `seed()`** lets tests run it with test `sub`s through the test identity provider.
  - **`whoami` keeps the token on the machine,** because `/me` doesn't return `sub` (see [Clients can never set or see `ownerId`](#clients-can-never-set-or-see-ownerid)).
  - **The localhost check** stops a reset from running `deleteMany` against the wrong database.
- **Rejected alternatives:**
  - **Committing the test user's `sub`.**
  - **A placeholder `sub` for A as well.** Nobody could sign in and see the seeded data.
  - **Deleting and re-creating on every `dev` start.** It wipes the reviewer's work.
  - **Upserting seed rows by fixed IDs.** It clashes with the per-Owner unique Collection name.
  - **Recording seed runs in a `seed_runs` table.** It's a schema change just for demo data.
  - **Pasting the token into jwt.io.** It sends a live token to a third-party site.
  - **A `db:owners` script** in place of the `psql` command.
- **Consequences:**
  - A reviewer who deletes all their data gets the seed back on the next `dev`.
  - A reviewer who wants their own data needs a one-time setup step: sign in, run `whoami`, set `SEED_OWNER_A_SUB`, then restart `dev`.
  - "Running the seed twice gives the same data" means the second `db:seed` changes nothing, and `db:seed:reset` rebuilds the same data every time.

### Transcripts

- **Decision:** each session's `/export` text goes in `transcripts/<YYYY-MM-DD>-<topic>/`. Logs are committed as they are, without scrubbing, at the end of each session. Raw `.jsonl` session files are not tracked, and `.gitignore` excludes them. (Changed on 2026-09-17: logs used to go through `transcripts/scrub.py` first, and the `.jsonl` used to be committed next to the export.)
- **Why:** the logs are a deliverable, and the owner wants them committed unaltered.
- **Rejected alternatives:** scrubbing logs with `transcripts/scrub.py`, redacting them by hand, and committing the raw `.jsonl` files.
- **Consequences:** this repo is public, so anything in a log is published. `transcripts/scrub.py` was removed.

---

## HTTP hardening

Decided in the pre-build grilling session (2026-09-16).

### Headers, rate limiting and logging

- **Decision:**
  - **API headers:** `helmet` with its defaults. CORS is as decided under [Auth](#the-spa-is-the-oauth-client-pkce-s256-the-api-is-a-stateless-bearer-resource-server).
  - **Rate limiting:** none.
  - **Request logging:** each request logs its method, **route pattern** (for example `/bookmarks/:id`, never the real path or query string), status and duration. Request and response bodies, tokens, `sub` and database error details are never logged.
  - **SPA:** a CSP `<meta>` tag whose `connect-src` allows only the API origin and the Auth0 tenant. The origins come from `frontend/.env` through Vite's `%VITE_…%` HTML replacement. `connect-src` also keeps `'self'` for the `vite` dev server's hot-reload socket. The SPA makes no data requests to its own origin. Scripts are `'self'` only. Styles also allow `'unsafe-inline'`, because Emotion (MUI) injects `<style>` tags. `frame-src` allows the tenant for the SDK's silent-auth iframe. In `vite` dev, the React Refresh preamble is injected above the `<meta>`, so it runs before the policy applies, and no hash or nonce is needed.
- **Why:**
  - **helmet costs nothing.**
  - **The app only runs locally,** so rate limiting would protect nothing real.
  - **Real paths and query strings contain IDs and search text,** and a log line shouldn't turn one Owner's data into something an operator can read.
  - **The CSP limits where injected script could send a token.** This matters because tokens live in JavaScript memory.
- **Rejected alternatives:**
  - **`@nestjs/throttler` keyed by `sub`.**
  - **Logging the full URL.**
- **Consequences:**
  - A request that matches no route (an unknown path, a CORS preflight or a body that fails to parse) logs `(unmatched)` in place of the pattern.
  - A real deployment would need rate limiting, and it's out of scope here. Auth0 rate-limits `/userinfo`, which `/me` handles with a cache (see [/me comes from /userinfo](#me-comes-from-userinfo-cached-until-the-token-expires)).
