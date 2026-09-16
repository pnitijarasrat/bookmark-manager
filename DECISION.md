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
- **Consequences:** there are no refresh tokens. Only one test user exists, so only one seeded Owner can actually sign in (see [#11](https://github.com/pnitijarasrat/bookmark-manager/issues/11)).

### No User table: the Owner is the Auth0 `sub`

From [#13](https://github.com/pnitijarasrat/bookmark-manager/issues/13) and [#6](https://github.com/pnitijarasrat/bookmark-manager/issues/6).

- **Decision:** the database has no User table. A User exists only as the `sub` in a verified access token. Collections and Bookmarks store that `sub` as their Owner. Its format is `auth0|<24 lowercase hex chars>`.
- **Why:** the `sub` is stable and is the only identity the access token carries. Keeping a User row would mean creating it on first sign-in and keeping profile data in sync, and nothing needs that row.
- **Rejected alternatives:** a User table keyed on `sub`, with a row created on the first request.
- **Consequences:**
  - Nothing is written on sign-in.
  - Profile data for `/me` is fetched per request, never stored. Where it comes from is decided in [#6](https://github.com/pnitijarasrat/bookmark-manager/issues/6).

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
- **Consequences:** Nest returns 404 for an unknown path before any guard runs, so an unauthenticated caller can tell which routes exist. We accept this, because the route list is in this public repo. The isolation promise is about Owners' data, not route names.

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
  - **Router setup:** the React Router 8 data router is created inside a component under `<Auth0Provider>`, and passes `getAccessTokenSilently` to loaders and actions through the router context. The exact router-context API in 8.4 gets checked during the build.
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

- **Decision:** logout calls `logout({ logoutParams: { returnTo: 'http://localhost:3000' } })`. This clears the in-memory cache and ends the Auth0 session through `/v2/logout`. The API does nothing on logout. After logout, `/` sends signed-out visitors to `/login`.
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
  - The format of other errors (400, 422, 500) follows [#8](https://github.com/pnitijarasrat/bookmark-manager/issues/8).

### The Owner scope lives in a repository layer

- **Decision:**
  - **Repositories:** every repository method takes the Owner as its first argument, `method(ownerId, …)`, and every query filters on it.
  - **How the Owner gets there:** the guard puts `sub` on the request. Controllers read it with an `@Owner()` parameter decorator and pass it on explicitly through services.
  - **Reads:** each read is one query on `id AND owner_id`.
  - **Writes:** Collection and Bookmark both have `@@unique([id, ownerId])`. Single-row updates and deletes use `where: { id_ownerId: { id, ownerId } }`, and the repository maps Prisma's `P2025` (record not found) to the standard 404.
  - **The boundary:**
    - An ESLint `no-restricted-imports` rule, run in CI, lets only `*.repository.ts` files import `PrismaService` or `@prisma/client`.
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
  - The seed script uses Prisma outside a repository, so it needs a lint exemption.

### IDs are database-generated UUIDv4

- **Decision:** every ID is a UUIDv4 in a native `uuid` column, generated with `@default(dbgenerated("gen_random_uuid()"))`.
- **Why:** random IDs reveal no counts, can't be enumerated, and carry no creation time.
- **Rejected alternatives:**
  - **Sequential integers.** They leak how many rows exist and invite enumeration.
  - **UUIDv7.** Its index benefit doesn't matter at this scale, and it contains the creation time.
  - **cuid2.** It needs an extra library and has no native Postgres type.
- **Consequences:** none.

### A Bookmark's Collection always has the same Owner

- **Decision:**
  - **The check:** before a Bookmark write with a `collectionId`, the repository looks the Collection up, scoped to the Owner, and answers 404 if it isn't found.
  - **The constraint:** a composite foreign key, `Bookmark(collection_id, owner_id) → Collection(id, owner_id)`, backed by the unique key on `Collection(id, owner_id)`.
  - **The race:** if the Collection is deleted between the check and the write, the foreign key fails with `P2003`, and the repository maps that to the same 404.
  - **Other database errors:** any unmapped Prisma error becomes a generic 500 whose body contains no database details.
- **Why:**
  - **The check** gives a clean, identical 404.
  - **The foreign key** keeps the rule true even if some code path skips the check.
- **Rejected alternatives:** only the application check, or only the foreign key.
- **Consequences:** if deleting a Collection sets its Bookmarks' `collectionId` to null ([#9](https://github.com/pnitijarasrat/bookmark-manager/issues/9)), a plain composite foreign key would null `owner_id` too. The migration must be hand-edited to `ON DELETE SET NULL (collection_id)` (Postgres 15+), which Prisma's schema can't express.

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

- **Decision:** React Router 8 loaders read data and actions write it. After every action, the router reloads the data for the current page. Pending states come from `useNavigation` and `useFetcher`. No client-side cache library is used.
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
- **Consequences:** the app's first render waits for the Auth0 SDK to finish loading.

### An expired session sends the user back to `/login`

- **Decision:** one `apiFetch` helper attaches the Bearer token to every request. The redirect is triggered in two cases:
  - `getAccessTokenSilently` throws.
  - The API returns 401.

  In either case, the helper clears the local auth state and throws a redirect to `/login?returnTo=<current path>&reason=expired`. `/login` then shows "Your session expired, sign in again".
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
- **Consequences:** the SPA can't tell a mistyped ID from someone else's resource, which is intended.

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
- **Consequences:** a change to the API contract needs the spec and the types regenerated.

### What the dialogs contain

- **Decision:**
  - **Collection dialog:**
    - a rename form
    - a read-only list of the Collection's Bookmarks from `GET /collections/:id/bookmarks`, each linking to `/bookmarks/:id` (following one closes this dialog and opens that one)
    - a Delete button, whose warning depends on [#9](https://github.com/pnitijarasrat/bookmark-manager/issues/9)
  - **Bookmark dialog:**
    - **Fields:** the edit form opens straight away.
    - **Collection picker:** a Select listing the User's Collections, with "None (Uncategorised)" as the first option.
    - **Buttons:** Save, Delete, Close, and "Open link", which opens the URL in a new tab with `rel="noopener noreferrer"`.
    - **Where the Collection list comes from:** the `/bookmarks` loader loads it next to the Bookmarks.
  - **Deleting a Bookmark:** asks for confirmation first.
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
- **Consequences:** how the "None" choice is sent (PUT or PATCH with `collectionId: null`) follows [#8](https://github.com/pnitijarasrat/bookmark-manager/issues/8).

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
- **Consequences:** which `/me` fields the shell shows follows [#6](https://github.com/pnitijarasrat/bookmark-manager/issues/6).

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
- **Consequences:** the filter options, param names and pagination UI follow [#8](https://github.com/pnitijarasrat/bookmark-manager/issues/8).
