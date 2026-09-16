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
  - **`/callback`:** shows only a loading indicator. `onRedirectCallback` sends the user to `returnTo` if it's a relative path inside the app, and to `/collections` otherwise.
  - **Signed-in users:** visiting `/login` sends them to `/collections`.
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
- **Consequences:** the frontend layout is decided in [#12](https://github.com/pnitijarasrat/bookmark-manager/issues/12).

### Logout

- **Decision:** logout calls `logout({ logoutParams: { returnTo: 'http://localhost:3000' } })`. This clears the in-memory cache and ends the Auth0 session through `/v2/logout`. The API does nothing on logout. After logout, `/` sends signed-out visitors to `/login`.
- **Why:** the return URL is fixed by the tenant, and a stateless API has no session to end.
- **Rejected alternatives:** a server-side token denylist. It would need state and a store, just to handle tokens that expire within 2 hours anyway.
- **Consequences:** an access token copied before logout keeps working until its `exp`, at most 2 hours later. Auth0 JWT access tokens can't be revoked, and we accept this.

### Open

- **Token expiry and 401 handling in the SPA** (what happens when `getAccessTokenSilently` fails, or the API returns 401) is deferred to [#12](https://github.com/pnitijarasrat/bookmark-manager/issues/12).
