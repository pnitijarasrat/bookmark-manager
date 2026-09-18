# Library versions and compatibility, September 2026

Research for [#3](https://github.com/pnitijarasrat/bookmark-manager/issues/3) (part of map [#1](https://github.com/pnitijarasrat/bookmark-manager/issues/1)). Checked on 2026-09-16.

Sources: the npm registry (`npm view <pkg> version dist-tags peerDependencies engines time`), GitHub releases, and first-party docs. Each claim below names its source. Versions change quickly, so re-run `npm view` before pinning.

## TL;DR

- **React Router v8 exists and is stable.** 8.0.0 shipped 2026-06-17. The latest is **8.4.0** (2026-09-15).
- **MUI v9 exists and is stable.** 9.0.0 shipped 2026-04-08. There was never a v8: the upgrade guide goes straight from v7 to v9. The latest is **9.4.0** (2026-08-28).
- **Prisma: use 7.10.0, not 8.** The `prisma` CLI's npm `latest` tag points at a release candidate (`8.0.0-rc.15`), while `@prisma/client`'s `latest` is 7.10.0. A plain `npm i prisma @prisma/client` therefore installs mismatched majors. Pin both packages to exactly `7.10.0`, as Prisma's own docs advise.
- **TypeScript: use 6.0.x, not 7.** npm `latest` is 7.0.2, the native port, and it ships without a compiler API. The Nest CLI depends on `typescript ~6.0.2`, and ts-jest requires `<7`.
- **Node: use 24 LTS (24.21.0).** React Router 8 and Testcontainers 12 both require at least 22.22.
- No hard peer-dependency conflicts remain once those pins are applied. The traps are listed under [Incompatibilities and traps](#incompatibilities-and-traps).

## Recommended version set

| Package | Version | Released | Key peers / engines (from npm) |
|---|---|---|---|
| Node.js | 24.21.0 (LTS "Krypton") | 2026-09-07 | Active LTS until 2026-10-20, then maintenance until 2028-04-30 (nodejs/Release `schedule.json`) |
| typescript | 6.0.3 | | pinned below 7; see traps |
| **Frontend** | | | |
| react / react-dom | 19.3.0 | | react-dom peer `react ^19.3.0` |
| @types/react / @types/react-dom | 19.3.0 / 19.3.0 | | |
| react-router | 8.4.0 | 2026-09-15 | peer `react >=19.2.7`, `react-dom >=19.2.7`; engines `node >=22.22.0` |
| vite | 8.3.0 | | engines `node ^20.19.0 \|\| >=22.12.0` |
| @vitejs/plugin-react | 6.1.1 | | peer `vite ^8.0.0` |
| @mui/material | 9.4.0 | 2026-08-28 | peer `react ^17 \|\| ^18 \|\| ^19`; optional peers `@emotion/react ^11.5.0`, `@emotion/styled ^11.3.0`, `@mui/material-pigment-css ^9.4.0` |
| @mui/icons-material | 9.4.0 | | peer `@mui/material ^9.4.0` |
| @emotion/react / @emotion/styled | 11.14.0 / 11.14.1 | | peer `react >=16.8.0` |
| @auth0/auth0-react | 2.25.0 | | peer `react ^16.11.0 \|\| ^17 \|\| ^18 \|\| ~19.0.1 \|\| ~19.1.2 \|\| ^19.2.1`; depends on `@auth0/auth0-spa-js ^2.25.0` |
| @auth0/auth0-spa-js | 2.26.0 (pulled in transitively) | | |
| **Backend** | | | |
| @nestjs/core, common, platform-express, testing | 12.0.3 | 2026-09-15 (12.0.0 on 2026-08-27) | core engines `node >= 20`; `reflect-metadata ^0.1.12 \|\| ^0.2.0`; `rxjs ^7.1.0` |
| @nestjs/cli | 12.0.1 | | engines `node >= 20.11`; depends on `typescript ~6.0.2` |
| @nestjs/config | 12.0.0 | | peer `@nestjs/common ^11 \|\| ^12` |
| express (via platform-express) | 5.2.1 | | |
| reflect-metadata / rxjs | 0.2.2 / 7.8.2 | | |
| class-validator / class-transformer | 0.15.1 / 0.5.1 | | optional; NestJS 12 also supports Standard Schema (e.g. Zod) |
| prisma (dev) / @prisma/client | **7.10.0 / 7.10.0** | 2026-08-25 | client engines `node ^20.19 \|\| ^22.12 \|\| >=24.0`; peer `typescript >=5.4.0` |
| @prisma/adapter-pg / pg | 7.10.0 / 8.23.0 | | |
| tsx (seed runner) | 4.23.13 | | |
| jose (JWT validation) | 6.2.12 | 2026-09-05 | |
| **Tests** | | | |
| vitest / @vitest/coverage-v8 | 5.0.1 | | peer `vite ^6.4 \|\| ^7 \|\| ^8`, `@types/node ^22 \|\| >=24`; engines `node ^22.12.0 \|\| ^24 \|\| >=26` |
| unplugin-swc / @swc/core | 1.6.0 / 1.16.2 | | used by the Vitest setup in NestJS's docs |
| supertest | 7.2.2 | | |
| testcontainers / @testcontainers/postgresql | 12.1.0 / 12.1.0 | | engines `node >= 22.22` |
| @types/node | 24.13.5 (match Node 24; npm `latest` is 22.x) | | |

## React Router v8

- **It exists and is stable.** The `react-router` npm `latest` tag is 8.4.0, and the GitHub release `react-router@8.4.0` is marked "Latest". The v8.0.0 entry in `CHANGELOG.md` is dated 2026-06-17.
- **v8 baseline**, per the CHANGELOG v8.0.0 "Baseline Support" section: Node 22.22.0+, React 19.2.7+, Vite 7+. The package is ESM-only and targets ES2022.
- **`react-router-dom` was removed in v8.** Import `RouterProvider` from `react-router/dom` and everything else from `react-router` (CHANGELOG v8.0.0).
- **Modes** (`docs/start/modes.md`): *Declarative* uses `<BrowserRouter>`. *Data* uses `createBrowserRouter` + `<RouterProvider>` and adds `loader`, `action`, `useFetcher` and pending states. *Framework* uses the `@react-router/dev` Vite plugin and `routes.ts`.
- **Data and declarative modes work in a plain Vite SPA without the framework plugin.** The "Custom Framework" doc (`docs/start/data/custom.md`, `[MODES: data]`) says: "Instead of using `@react-router/dev`, you can integrate React Router's framework features (like loaders, actions, fetchers, etc.) into your own bundler … with Data Mode." You only need `react-router`. `@react-router/dev` is only for framework mode; it peers on `vite ^7 || ^8` and pulls in wrangler and RSC optional peers.
- **Loader and action idioms**: route objects take `loader: ({ request, params, context }) => …` and `action`. Pass `request.signal` to `fetch`. Read the result with `useLoaderData`.
- **Route guards**: middleware is always on in v8. The `future.v8_middleware` flag was removed, and `context` is always a `RouterContextProvider` (CHANGELOG v8.0.0). `docs/how-to/middleware.md`, "Quick Start (Data Mode)", shows `middleware: [authMiddleware]` on a route object and `throw redirect("/login")` inside it, with typed context from `createContext<User | null>(null)`. A guard can also be a `throw redirect(...)` in a parent route's `loader`.

## MUI v9

- **It exists and is stable.** The GitHub release `v9.0.0` (2026-04-08) says: "We're excited to announce the stable release of Material UI v9.0!" The npm `latest` tag is 9.4.0, and `latest-v7` is 7.3.11. **There is no v8.** The official guide is "Upgrade to v9: … from Material UI v7 to v9" (`docs/data/material/migration/upgrade-to-v9/upgrade-to-v9.md`).
- **Packages**: `@mui/material`, `@mui/icons-material`, `@mui/system` and friends, all at 9.x.
- **React requirement**: peer `react ^17.0.0 || ^18.0.0 || ^19.0.0` (npm).
- **Styling engine**: Emotion is still the default. `@emotion/react` and `@emotion/styled` are optional peers, but you must install them unless you opt into Pigment CSS through the optional `@mui/material-pigment-css` peer.
- **Breaking changes vs v7 that matter to us** (upgrade guide):
  - **Grid**: `GridLegacy` is removed. Use `Grid` with `size={{ xs: 12, sm: 6 }}`; there is no `item` prop and no `xs`/`sm` props. `direction="column"` is removed, so use `Stack` for vertical layouts.
  - **Theme**: `MuiTouchRipple` was removed from the theme `components` types. Otherwise `createTheme` is unchanged.
  - **Dialog/Modal**: `disableEscapeKeyDown` is removed. Check `reason` in `onClose` instead.
  - **Button-like components**: new `nativeButton` prop. It is needed when `component=` swaps the element type, which matters when rendering a router `Link` as a `Button` whose element isn't a `<button>`. MUI warns in development if the prop is missing.
  - `Menu`/`MenuItem` and `Tab` throw an error when rendered outside their parent. `TextField select` renders its label as a `<div>`.
  - Browser targets were raised to Chrome 117, Firefox 121 and Safari 17.
  - Environments without layout (jsdom, happy-dom) are now detected by feature or user-agent sniffing rather than `NODE_ENV === 'test'`. Expect small differences in component tests.
  - Deprecated props and CSS classes are removed; codemods are available through `npx @mui/codemod@latest deprecations/...`.

## NestJS

- **Current major: 12.** The GitHub release v12.0.0 is dated 2026-08-27; the latest is 12.0.3 (2026-09-15). v11 continues under the `legacy` npm tag (11.2.5).
- **Node requirement**, per the v12.0.0 release notes: "v12 requires **Node.js v20.19+ or v22.12+**". That aligns with `require(esm)`, because the core packages now ship as ESM. CommonJS apps keep working.
- **Other v12 changes**: first-class Standard Schema validation (`@Body({ schema })` with `StandardSchemaValidationPipe`), and `@nestjs/config` moved from Joi to Standard Schema. New projects default to Vitest.
- **Idiomatic global JWT guard**: `docs.nestjs.com`, "Authentication" (`content/security/authentication.md`), registers the guard globally with `{ provide: APP_GUARD, useClass: AuthGuard }`. Public routes opt out through a `@Public()` decorator built with `SetMetadata(IS_PUBLIC_KEY, true)` and read by `Reflector`. The brief requires authentication on every route, so we may not need `@Public()` at all. The docs' sample uses `@nestjs/jwt` (12.0.2, peer `@nestjs/common ... || ^12`), which is built for locally signed secrets. For Auth0 RS256 tokens, verify against the JWKS instead (next section).

## JWT validation for NestJS

| Option | Latest | Maintenance | Fit |
|---|---|---|---|
| `jose` | 6.2.12 (2026-09-05) | repo `panva/jose` last pushed 2026-09-14; not archived | **Recommended.** `createRemoteJWKSet` + `jwtVerify(token, jwks, { issuer, audience, algorithms: ['RS256'] })` inside a plain `CanActivate` guard. No dependencies. Works with any Nest platform. |
| `passport-jwt` + `jwks-rsa` | 4.0.1 (**2022-12-24**) + 4.1.0 (2026-06-19) | `mikenicholson/passport-jwt` last pushed **2024-02-03**; depends on `jsonwebtoken ^9`. `jwks-rsa` is active (pushed 2026-08-24; engines `node ^20.19 \|\| ^22.12 \|\| >=23`) | Works through `@nestjs/passport` 12.0.0, but `passport-jwt` is effectively unmaintained and adds a passport layer we don't need. |
| `express-oauth2-jwt-bearer` | 1.10.0 (2026-08-18) | `auth0/node-oauth2-jwt-bearer` pushed 2026-09-15 | Auth0's own package, but it is Express middleware rather than a Nest guard. It still depends on **`jose ^4`**, an old major, so it would install a second copy of `jose`. Its engines list `^24.0.0` but not 26. |

## Prisma

- **Current stable major: 7 (7.10.0, 2026-08-25).**
- **Prisma 8 status**: on GitHub it is still `v8.0.0-rc.*` (latest listed release v8.0.0-rc.11, 2026-09-13, marked "Pre-release"). On npm it is `8.0.0-rc.15`. Prisma's docs index (`prisma.io/docs/llms.txt`) nonetheless presents "Prisma ORM 8" as current and describes it as "a ground-up TypeScript rewrite". It also says: "Prisma ORM 7 remains fully supported; **pin prisma and @prisma/client to 7.10.0**." Prisma's own v7 NestJS guide installs `prisma@7.10.0` and `@prisma/client@7.10.0`. The brief requires stable versions, so we choose 7.10.0.
- **`prisma.config.ts`** (v7 Config API reference): `defineConfig({ schema, migrations: { path, seed }, datasource: { url: env('DATABASE_URL') } })`, with `import 'dotenv/config'` at the top. The v7 docs note that the config's `adapter` property "has been removed in Prisma ORM v7"; migrations work with driver adapters without it.
- **Generator**: `generator client { provider = "prisma-client"; output = "../src/generated/prisma" }`. The `datasource` block holds only `provider = "postgresql"`, because the URL now lives in the config file. Import the client from the generated path (`./generated/prisma/client.js`), not from `@prisma/client` (v7 NestJS guide).
- **Driver adapter** (required in v7): `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })`. The v7 NestJS guide shows a `PrismaService extends PrismaClient` built this way.
- **Seeding**: `npx prisma db seed` runs `migrations.seed`, for example `"tsx prisma/seed.ts"`. The v7 Config API reference says: "Seeding is only triggered explicitly via this command."
- **Per-request scoping**: client extensions (`$extends`) with the `query` component. The v7 docs say you can "bind one client to a specific filter or user … for example … user isolation … in a row-level security (RLS) extension", and they show wrapping `query(args)` in `prisma.$transaction([...])` for RLS (`/docs/orm/v7/prisma-client/client-extensions/query`). An extended client is a new object, so create one per request, for example from a request-scoped provider.

## Auth0 SPA SDKs

- **Versions**: `@auth0/auth0-react` 2.25.0, which depends on `@auth0/auth0-spa-js ^2.25.0` (latest 2.26.0).
- **Compatibility**: the auth0-react peer range `^19.2.1` covers React 19.3.0. The SDK has no React Router dependency; hook `onRedirectCallback` to the router's `navigate`.
- **PKCE with S256 is hardcoded, not optional.** The spa-js source sets `code_challenge_method: 'S256'` (`src/Auth0Client.ts`, `src/Auth0Client.utils.ts`), and the README banner reads "Authorization Code Grant Flow with PKCE".
- **Token storage** (`src/global.ts` docs): `cacheLocation` accepts `memory` or `localstorage` and defaults to `memory`. A custom `cache` implementation takes precedence.
- **Refresh tokens**: `useRefreshTokens` defaults to `false`, and silent renewal then uses a hidden iframe with `prompt=none`. The SDK source says this "relies on cookies … requires a Custom Domain to function reliably" because browsers block third-party cookies. It also says: "Use of refresh tokens must be enabled by an administrator on your Auth0 client application." `useRefreshTokensFallback` defaults to `false`. Rotating refresh tokens (`refreshTokenMode: Offline`) are the default when refresh tokens are on.
  - **Consequence for this project**: the tenant is `dev-yg.us.auth0.com`, which is not a custom domain, and we have no dashboard access. We can neither confirm nor enable refresh-token rotation. With in-memory storage, a page reload may therefore need a full redirect when the iframe's silent auth is blocked by the browser. **This needs to be tested against the real tenant** (for example, request `offline_access` with `useRefreshTokens: true` and see whether a refresh token comes back) before we choose a storage strategy.

## Test tooling

- **Vitest 5.0.1** is the NestJS 12 default. The unit-testing doc says: "Newly generated projects use Vitest by default." Decorator metadata needs SWC, as in the NestJS "SWC" recipe (`content/recipes/swc.md`, "Vitest" section): `vitest unplugin-swc @swc/core @vitest/coverage-v8`, with `swc.vite()` in `vitest.config.ts`. The same runner covers the Vite frontend.
- **Jest 30.5.1** still works, but ts-jest 29.4.12 peers on `typescript >=4.3 <7` and `jest ^29 || ^30`. We don't need it if we use Vitest.
- **Supertest 7.2.2**: `request(app.getHttpServer())`, as in the NestJS e2e docs.
- **Testcontainers 12.1.0** with `@testcontainers/postgresql` 12.1.0, which depends on `testcontainers ^12.1.0`. It requires **Node >= 22.22** and a Docker runtime.

## Incompatibilities and traps

1. **Mismatched Prisma majors.** npm `latest` resolves `prisma` to `8.0.0-rc.15` but `@prisma/client` to `7.10.0`. Pin both to `7.10.0`, along with `@prisma/adapter-pg@7.10.0`.
2. **TypeScript 7.** npm `latest` is 7.0.2, and the TS 7.0 announcement (2026-07-08) says it "does not ship with an API", expecting one in 7.1. `@nestjs/cli` depends on `typescript ~6.0.2`, and `ts-jest` peers on `<7`. Pin `typescript@6.0.3` in the workspace.
3. **`react-router-dom`.** Its npm `latest` is still **7.18.4** (v7 maintenance) and it peers on `react >=18`. Installing it out of habit brings in v7 beside v8. Use only `react-router@8`.
4. **Node floor.** React Router 8 (`>=22.22.0`) and Testcontainers 12 (`>= 22.22`) set the effective minimum. Vitest 5 excludes Node 20. Use Node 24 LTS. Node 26 becomes LTS on 2026-10-28; `express-oauth2-jwt-bearer`'s engines field doesn't list it.
5. **`@types/node`.** npm `latest` is 22.20.3. Pin `@types/node@24` to match the runtime; Vitest 5 peers on `^22 || >=24`, so both satisfy it.
6. **MUI Emotion peers** are optional in metadata, but you must install them with the default engine.
7. **`express-oauth2-jwt-bearer`** would add `jose@4` beside `jose@6`. This is another reason to use `jose` directly.
8. **Auth0 refresh tokens** depend on tenant settings we can't see or change (see above). This is a design risk rather than a version conflict.

No other peer ranges in the recommended set conflict: React 19.3.0 satisfies React Router, MUI, Auth0 and Emotion; Vite 8 satisfies `@vitejs/plugin-react` 6 and Vitest 5; `@nestjs/*` 12 satisfies config, passport and jwt.
