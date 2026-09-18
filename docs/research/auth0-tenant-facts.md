# Auth0 tenant facts

Resolves [Auth0 tenant facts](https://github.com/pnitijarasrat/bookmark-manager/issues/2). Probed on 2026-09-16 using only public, unauthenticated requests against `https://dev-yg.us.auth0.com`. No credentials were submitted and no accounts were created. Facts marked **(probe)** were observed directly. Facts marked **(needs a login)** can only be confirmed by a human completing a sign-in.

## Summary

- **PKCE S256 works, and the client is a public SPA client.** The token endpoint accepts a code exchange with no client secret.
- **Implicit, password and client-credentials grants are all refused** for this client. Nobody can accidentally use the implicit flow.
- **The only allowed callback is `http://localhost:3000/callback`**, and the only allowed logout return is `http://localhost:3000`. The **only allowed CORS origin is `http://localhost:3000`**, so the SPA must be served from exactly that origin.
- **The audience `https://bbl-candidate-test-api` is registered.** An unknown audience is rejected.
- **Sign-up is disabled.** The login page offers two ways in: an email/password form for accounts that already exist, and **"Continue with Google"**. Google uses **Auth0 developer keys**, so anyone with a Google account can sign in. The same keys make SSO and silent re-authentication unreliable.
- **The refresh-token grant is enabled** for the client. Whether a refresh token is actually issued (the API's "Allow Offline Access" setting) is **(needs a login)**.
- **Access tokens are expected to be RS256 JWTs carrying `sub`, not `email`.** The exact claim set is **(needs a login)**.

## Discovery document (probe)

Source: `GET /.well-known/openid-configuration`

| Field | Value |
|---|---|
| `issuer` | `https://dev-yg.us.auth0.com/` (with trailing slash) |
| `authorization_endpoint` | `/authorize` |
| `token_endpoint` | `/oauth/token` |
| `userinfo_endpoint` | `/userinfo` |
| `revocation_endpoint` | `/oauth/revoke` |
| `jwks_uri` | `/.well-known/jwks.json` |
| `code_challenge_methods_supported` | `S256`, `plain` |
| `response_types_supported` | `code`, `token`, `id_token` and combinations |
| `response_modes_supported` | `query`, `fragment`, `form_post` |
| `token_endpoint_auth_methods_supported` | includes `none` (public clients) |
| `id_token_signing_alg_values_supported` | `HS256`, `RS256`, `PS256` |
| `scopes_supported` | includes `openid`, `profile`, `email`, `offline_access` |
| `claims_supported` | `sub`, `email`, `email_verified`, `name`, `nickname`, `picture`, … |

The document lists `plain` and `implicit` because it describes the whole tenant. What this client actually allows is covered in the next section. `HS256` appears among ID-token algorithms, so the API must pin `RS256` and never accept an algorithm that the token itself names.

## JWKS (probe)

Source: `GET /.well-known/jwks.json`. It publishes two RSA signing keys, both with `alg: RS256` and `use: sig`, and distinct `kid`s. That means validation must select the key by `kid`.

## What this client is allowed to do (probe)

All requests used `client_id=H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA`.

| Probe | Result | Meaning |
|---|---|---|
| `/authorize`: `response_type=code` + S256 + audience + `openid profile email` | 302 to `/u/login` | The intended flow starts normally |
| same, plus `offline_access` | 302 to `/u/login` | The scope isn't rejected up front |
| `response_type=token` | 403 `unauthorized_client: Grant type 'implicit' not allowed for the client.` | **Implicit flow is disabled** for this client |
| `response_type=id_token` | 403 (same) | same |
| `response_type=code` without `code_challenge` | 302 to `/u/login` | **Auth0 doesn't require PKCE here.** Our SPA must always send S256; the tenant won't enforce it for us |
| `redirect_uri=http://localhost:5173/callback` | 400 `Callback URL mismatch` | Only `http://localhost:3000/callback` is registered |
| `audience=https://not-a-real-api` | redirect with `access_denied: Service not found` | Audiences are checked; `https://bbl-candidate-test-api` exists |
| `prompt=none` (no session) | redirect with `login_required` | Silent authentication is supported and fails cleanly |
| `prompt=none&response_mode=web_message` | 200, `targetOrigin = "http://localhost:3000"` | `http://localhost:3000` is an allowed web origin (hidden-iframe silent authentication) |
| `screen_hint=signup` | redirect with `invalid_request: signup is disabled` | **No self-service sign-up** |
| `connection=google-oauth2` | 302 to Google with `redirect_uri=https://login.us.auth0.com/login/callback` | Google is enabled and uses **Auth0 developer keys** (the shared `login.*.auth0.com` callback) |
| `POST /oauth/token`, `authorization_code`, bogus code, **no secret** | 400 `invalid_grant: Invalid authorization code` | **Public client**: no secret needed, as PKCE requires |
| `POST /oauth/token`, `refresh_token`, bogus token, no secret | 400 `invalid_grant: Unknown or invalid refresh token.` | The **refresh-token grant is enabled** (a disabled grant returns `unauthorized_client`) |
| `POST /oauth/token`, `password` | 403 `unauthorized_client` | Password grant disabled |
| `POST /oauth/token`, `client_credentials` | 403 `unauthorized_client` | No machine-to-machine tokens for this client |
| `POST /oauth/token` with `Origin: http://localhost:3000` | `access-control-allow-origin: http://localhost:3000` | The SPA can call the token endpoint from port 3000 |
| same, with `Origin: http://localhost:5173` | no CORS header | **Other origins are blocked.** The SPA can't run on Vite's default port |
| `/v2/logout?returnTo=http://localhost:3000` | 302 to `http://localhost:3000` | Logout URL registered |
| `/v2/logout?returnTo=http://localhost:5173` | 400 | Only the registered URL is allowed |
| `/oidc/logout?post_logout_redirect_uri=http://localhost:3000` | 302 to `http://localhost:3000/` | RP-initiated OIDC logout also works |

## Login page and sign-up (probe)

The Universal Login page is titled "Log in | BBL Bookmarks (Full-Stack)". It shows:

- An email/password form for the `Username-Password-Authentication` database connection, with a password-reset link.
- A **"Continue with Google"** button.
- **No sign-up link**, which is consistent with the `signup is disabled` error above.

The consequences for seeding and for [Seed data for two Users](https://github.com/pnitijarasrat/bookmark-manager/issues/11):

- Database-connection users must already exist; we can't create them. Whether the brief's authors provide test credentials is outside this repo's knowledge.
- **Anyone with a Google account can sign in** through the Google connection. The first sign-in creates the Auth0 user automatically. Two different Google accounts therefore give two real, distinct `sub`s (`google-oauth2|…`) without dashboard access.

## Auth0 developer keys: what they break

Auth0's documentation ([Test Social Connections with Auth0 Developer Keys](https://auth0.com/docs/authenticate/identity-providers/social-identity-providers/devkeys), "Limitations of developer keys when using Universal Login") says:

- The developer apps call back to `https://login.auth0.com/login/callback` rather than the tenant's own domain. As a result, **"the SSO cookie [is] not being set on your own tenant domain"** and **"Single Sign-On will not function properly."**
- Developer keys can't be used with custom domains.

The implication for [Auth architecture: where PKCE runs and how tokens flow](https://github.com/pnitijarasrat/bookmark-manager/issues/5): for Google sign-ins, silent re-authentication (`prompt=none`) has no tenant session to find. **A memory-only token cache will lose the session on every page reload, in every browser**, not only in Safari as the archived attempt assumed. Database-connection users do get a tenant session cookie, but silent authentication in a hidden iframe still depends on third-party cookies being allowed.

## Refresh tokens (probe + needs a login)

- **Probe:** the `refresh_token` grant is enabled on the client, and `offline_access` is accepted at `/authorize`.
- **Needs a login:** Auth0 only issues a refresh token when the API (`https://bbl-candidate-test-api`) has "Allow Offline Access" enabled ([Use Refresh Tokens](https://auth0.com/docs/secure/tokens/refresh-tokens/use-refresh-tokens)). Whether rotation is configured can't be seen from outside either. **To confirm:** complete one sign-in with `scope=openid profile email offline_access` and check whether the token response includes `refresh_token`.
- Note that the brief fixes the scope at `openid profile email`. Adding `offline_access` is a deviation that would need justifying.

## Access token contents (needs a login)

- When `audience` is sent, Auth0 issues a **JWT** access token for that API. Without `audience`, it issues an opaque token usable only at `/userinfo` ([Get Access Tokens](https://auth0.com/docs/secure/tokens/access-tokens/get-access-tokens)). The SPA must always send the audience.
- **Expected claims:** `iss` = `https://dev-yg.us.auth0.com/`, `sub`, `aud`, `iat`, `exp`, `scope`, `azp`. When `openid` is requested, `aud` is typically an array that also contains `https://dev-yg.us.auth0.com/userinfo`, which lets the same token call `/userinfo`. Auth0 access tokens carry **no `email` or profile claims** unless an Action adds namespaced custom claims, and we can't see or change Actions. **To confirm:** decode one real access token.
- **Design implication for [User identity and /me](https://github.com/pnitijarasrat/bookmark-manager/issues/6):** the API can rely only on `sub`. Profile data must come from `/userinfo` (if `aud` includes it) or from the SPA's ID token.

## Checklist for the first human sign-in

One sign-in on `http://localhost:3000` confirms everything still open:

1. Decode the access token: `alg`, `kid`, `iss`, `aud` (is it an array, and does it include `/userinfo`?), `scope`, and any custom claims.
2. Call `/userinfo` with that access token: does it return `email`, `name` and `picture`?
3. Repeat with `offline_access`: is a `refresh_token` returned, and does a refresh rotate it?
4. For a Google sign-in, reload the page: does `getTokenSilently` succeed, or does it return `login_required`?

## Sources

- Tenant discovery document: https://dev-yg.us.auth0.com/.well-known/openid-configuration
- Tenant JWKS: https://dev-yg.us.auth0.com/.well-known/jwks.json
- Tenant `/authorize`, `/oauth/token`, `/v2/logout` and `/oidc/logout` responses (probes above)
- Auth0: [Authorization Code Flow with PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce)
- Auth0: [Test Social Connections with Auth0 Developer Keys](https://auth0.com/docs/authenticate/identity-providers/social-identity-providers/devkeys)
- Auth0: [Use Refresh Tokens](https://auth0.com/docs/secure/tokens/refresh-tokens/use-refresh-tokens)
- Auth0: [Get Access Tokens](https://auth0.com/docs/secure/tokens/access-tokens/get-access-tokens)
- Cross-check: [Lessons from the archived attempt](https://github.com/pnitijarasrat/bookmark-manager/issues/4), which independently found S256, the public client, two RS256 keys, HS256 listed for ID tokens, and the password grant refused
