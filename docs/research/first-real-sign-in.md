# First real sign-in against the tenant

Answers [First real sign-in against the tenant](https://github.com/pnitijarasrat/bookmark-manager/issues/13), which follows up the open items in [Auth0 tenant facts](https://github.com/pnitijarasrat/bookmark-manager/issues/2).

**Date:** 2026-09-16. **Method:** a human signed in on `http://localhost:3000` through a throwaway PKCE (S256) page. The page was not committed. It redacted every result in the browser before recording it: only claim names, public tenant values and the *format* of `sub` were kept, never emails, names or `sub` values. **Auth0 user:** one existing test user of the `Username-Password-Authentication` database connection, signed in through Universal Login twice. No Google sign-in was made. In this doc, "Auth0 user" means an identity in the tenant, and "User" means the domain User from `CONTEXT.md`.

## Decisions taken during this ticket

- **Sign-in goes through Universal Login** with existing database-connection Auth0 users. Google sign-in (Auth0 developer keys) was dropped, so this project doesn't rely on it.
- **No `offline_access`.** The scope stays at `openid profile email`, fixed by the brief (see [#1](https://github.com/pnitijarasrat/bookmark-manager/issues/1)), so no refresh tokens are requested. Question 3 (refresh-token issuance and rotation) was therefore not tested.

## 1. Access token (audience `https://bbl-candidate-test-api`)

| Field | Observed |
| --- | --- |
| Format | JWT, header `alg: RS256`, `typ: JWT` |
| `kid` | Present in the tenant JWKS. The ID token is signed with the same key |
| `iss` | `https://dev-yg.us.auth0.com/` (trailing slash) |
| `aud` | **Array**: `["https://bbl-candidate-test-api", "https://dev-yg.us.auth0.com/userinfo"]` |
| `scope` | `openid profile email` |
| `azp` | The client ID `H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA` |
| Lifetime | `exp - iat` = 7200 s. The token response had `expires_in: 7200` |
| All claims | `aud`, `azp`, `exp`, `iat`, `iss`, `scope`, `sub` |
| Custom or profile claims | **None**: no `email`, `name` or namespaced claims, and no `gty` or `permissions` |

- The token response keys were `access_token`, `expires_in`, `id_token`, `scope` and `token_type` (`Bearer`). No `refresh_token` was returned, as expected without `offline_access`.
- **ID token:** RS256, and its `nonce` matched. Its claims were `aud`, `auth_time`, `email`, `email_verified`, `exp`, `iat`, `iss`, `name`, `nickname`, `nonce`, `picture`, `sid`, `sub`, `updated_at` and `user_id`. Its `sub` equals the access token's.

**Implications:**

- The API must verify RS256 against the JWKS, and check `iss` with its trailing slash.
- `aud` is an array, so the API should check that it **contains** `https://bbl-candidate-test-api` rather than comparing it for equality (`jose` does this).
- The API only learns `sub` from the token. Profile data for `/me` must come from elsewhere (see question 2).

## 2. `/userinfo` with the access token

- **Status 200.** The response keys were `email`, `email_verified`, `name`, `nickname`, `picture`, `sub` and `updated_at`. `email`, `name` and `picture` were all non-empty.
- The response `sub` equals the access token's `sub`.

Only the browser called `/userinfo` in this test. Because `aud` includes `/userinfo`, the API should also be able to call it with the caller's own bearer token (untested). The alternative is for the SPA to read the same data from the ID token.

## 3. Refresh tokens

**Not tested, by decision:** `offline_access` was dropped (see above). The brief's scope is kept as it is.

## 4. Silent authentication after a reload

The test ran shortly after a Universal Login (database) sign-in, in a reloaded page with no tokens in memory. `prompt=none` was sent both ways:

| Attempt | Result |
| --- | --- |
| Hidden iframe, `response_mode=web_message` (what `auth0-spa-js` `getTokenSilently` does) | `error=consent_required`, "Consent required" |
| Top-level redirect | `error=consent_required`, "Consent required" |

**Silent authentication fails even for a database-connection Auth0 user who has just signed in.** The error is `consent_required`, not `login_required`. The failure therefore has nothing to do with Google developer keys, which [Auth0 tenant facts](https://github.com/pnitijarasrat/bookmark-manager/issues/2) named as the reason silent re-authentication would break. It is also not caused by third-party cookies, because the top-level redirect fails the same way.

**Likely cause (inference):** Auth0's [User consent and third-party applications](https://auth0.com/docs/get-started/applications/confidential-and-public-applications/user-consent-and-third-party-applications) page says: "Even when consent is skipped for first-party applications, a login confirmation prompt may still appear when the application uses a non-verifiable callback URI (such as `localhost` or a custom URI scheme)."

Our only allowed callback is `http://localhost:3000/callback`. With `prompt=none`, Auth0 can't show that prompt, so it returns `consent_required`. If that is the cause, it can't be fixed from our side, because the callback URL can't be changed. The design should therefore assume that silent authentication is unavailable.

**Implication for [Auth architecture](https://github.com/pnitijarasrat/bookmark-manager/issues/5):**

- With no refresh tokens and no working silent authentication, there is no way to renew tokens without user interaction.
- A memory-only token cache means **re-login on every reload**.
- Caching tokens across reloads (e.g. `cacheLocation: 'localstorage'`) avoids that, but still needs an interactive login when the 2-hour access token expires. It also puts tokens in storage that XSS can reach.
- This trade-off belongs in the Decisions write-up (see [#1](https://github.com/pnitijarasrat/bookmark-manager/issues/1)).

## 5. Distinct `sub`s for different Users

- **Format:** database-connection users have `sub` = `auth0|<24 lowercase hex chars>`.
- **Distinctness: not tested.** Both sign-ins used the same Auth0 user (the same `sub` both times). Confirming that two Auth0 users yield two `sub`s needs a second existing database-connection user, which is relevant to [Seed data for two Users](https://github.com/pnitijarasrat/bookmark-manager/issues/11). Sign-up is disabled, so a second Auth0 user can't be created from here.

## Sources

- Redacted probe reports from the sign-in session on 2026-09-16 (not committed)
- Tenant JWKS: https://dev-yg.us.auth0.com/.well-known/jwks.json
- Auth0: [User consent and third-party applications](https://auth0.com/docs/get-started/applications/confidential-and-public-applications/user-consent-and-third-party-applications)
- [Auth0 tenant facts](https://github.com/pnitijarasrat/bookmark-manager/issues/2) (the checklist this ticket completes)
