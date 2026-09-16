# First real sign-in against the tenant

Answers [First real sign-in against the tenant](https://github.com/pnitijarasrat/bookmark-manager/issues/13), which follows up the open items in [Auth0 tenant facts](https://github.com/pnitijarasrat/bookmark-manager/issues/2).

**Date:** 2026-09-16. **Method:** a human signed in on `http://localhost:3000` through a throwaway PKCE (S256) page. The page was not committed. It redacted every result in the browser before recording it: only claim names, public tenant values and the *format* of `sub` were kept, never emails, names or `sub` values. **Account:** one existing test user of the `Username-Password-Authentication` database connection, signed in through Universal Login (twice). No Google sign-in was made.

## Decisions taken during this ticket

- **Sign-in goes through Universal Login** with the existing database test account(s). Google sign-in (Auth0 developer keys) was dropped, so its SSO limitations no longer matter.
- **No `offline_access`.** The scope stays at the brief's `openid profile email`, so no refresh tokens are requested. Question 3 (refresh-token issuance and rotation) was therefore not tested.

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

Because `aud` includes `/userinfo`, the API can call `/userinfo` with the caller's own bearer token to get profile data. The alternative is for the SPA to read the same data from the ID token.

## 3. Refresh tokens

**Not tested, by decision:** `offline_access` was dropped (see above). The brief's scope is kept as it is.

## 4. Silent authentication after a reload

The test ran after a Universal Login (database) sign-in, in a fresh page load with no tokens in memory. `prompt=none` was sent both ways:

| Attempt | Result |
| --- | --- |
| Hidden iframe, `response_mode=web_message` (what `auth0-spa-js` `getTokenSilently` does) | `error=consent_required`, "Consent required" |
| Top-level redirect | `error=consent_required`, "Consent required" |

**Silent authentication fails even for a database user with a live tenant session.** The error is `consent_required`, not `login_required`. The failure is therefore not limited to Google developer keys, as [Auth0 tenant facts](https://github.com/pnitijarasrat/bookmark-manager/issues/2) expected. It is also not caused by third-party cookies, because the top-level redirect fails the same way.

**Likely cause (inference):** Auth0's [User consent and third-party applications](https://auth0.com/docs/get-started/applications/confidential-and-public-applications/user-consent-and-third-party-applications) page says: "Even when consent is skipped for first-party applications, a login confirmation prompt may still appear when the application uses a non-verifiable callback URI (such as `localhost` or a custom URI scheme)."

Our only allowed callback is `http://localhost:3000/callback`. With `prompt=none`, Auth0 can't show that prompt, so it returns `consent_required`. We can't change the callback URL, so this should be treated as **permanent for this project**.

**Implication for [Auth architecture](https://github.com/pnitijarasrat/bookmark-manager/issues/5):**

- With no refresh tokens and no working silent authentication, there is no way to renew tokens without user interaction.
- A memory-only token cache means **re-login on every reload**.
- Caching tokens across reloads (e.g. `cacheLocation: 'localstorage'`) avoids that, but still needs an interactive login when the 2-hour access token expires. It also puts tokens in storage that XSS can reach.
- This trade-off belongs in the Decisions write-up.

## 5. Distinct `sub`s for different Users

- **Format:** database-connection users have `sub` = `auth0|<24 lowercase hex chars>`.
- **Distinctness: not tested.** Both sign-ins used the same test account (the same `sub` both times). Confirming that two Users yield two `sub`s needs a second existing database account, which is relevant to [Seed data for two Users](https://github.com/pnitijarasrat/bookmark-manager/issues/11). Sign-up is disabled, so a second account can't be created from here.

## Sources

- Redacted probe reports from the sign-in session on 2026-09-16 (not committed)
- Tenant JWKS: https://dev-yg.us.auth0.com/.well-known/jwks.json
- Auth0: [User consent and third-party applications](https://auth0.com/docs/get-started/applications/confidential-and-public-applications/user-consent-and-third-party-applications)
- [Auth0 tenant facts](https://github.com/pnitijarasrat/bookmark-manager/issues/2) (the checklist this ticket completes)
