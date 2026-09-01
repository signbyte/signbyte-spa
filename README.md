# signbyte — signing portal web UI

The product web interface for the qualified electronic signing portal. A user signs
in with their national electronic identity, uploads documents, builds a signing
envelope, signs through the proven signing chain, follows status, reads the
validation verdict, and downloads the signed container.

Two screens are public (no session): the **marketing landing** at `/welcome` — a
signed-out visitor at the root is sent there, and "Back to site" links return there —
and the **verify** screen, where anyone can check a signed document without an
account. Everything else sits behind the session guard; a guest following a deep
link goes to login first and is returned to their target.

It is a static single-page application. It talks **only** to the portal API (the
backend-for-frontend) and holds **no** token, signing key, or durable data — just an
http-only session cookie and a readable anti-forgery token, plus transient in-memory
UI state. The only cryptography in the browser is the eID card's own, run through the
vendored Web eID library.

## Stack

- **Vue 3** (`<script setup>` SFCs) + **Vue Router** + **Pinia** + **vue-i18n**.
- **Tailwind CSS** for styling, carrying the product design tokens; accessible
  components are kept as owned source in `src/components/ui`.
- **Vite** build → a static bundle; **Vitest** + Vue Test Utils for unit tests.
- **TypeScript** throughout.

The dependency surface is kept deliberately small: native `fetch` (no HTTP client
dependency), inline SVG icons (no icon library), and CSS for motion (no animation
library). The lockfile is committed; continuous integration installs with `npm ci`
and runs a dependency audit. Dependency updates are reviewed deliberately rather than
taken automatically.

## Layout

```
src/
  assets/main.css      design tokens (Tailwind theme) + base styles + self-hosted fonts
  components/          the app shell + owned UI primitives (ui/)
  i18n/                vue-i18n setup + en/lv message catalogues
  lib/                 the fetch wrapper (api) + class-merge helper (cn)
  router/              routes + the session route guard + the sign-route guard (a completed source redirects to its hub)
  stores/              Pinia stores (session, ...)
  views/               one component per screen
public/
  fonts/               self-hosted woff2 (see fonts/README.md)
  web-eid.js           vendored Web eID browser library
```

## Develop

```
npm install
npm run dev        # Vite dev server; proxies /api/portal to the local stack
npm run build      # type-check + static production bundle into dist/
npm run typecheck  # type-check only
npm test           # unit tests
```

The dev server proxies `/api/portal/*` to a local portal API (override the target
with `DEV_API_TARGET`). In production the bundle is served behind the public edge,
co-located with the API path so the session cookie stays same-site and there is no
cross-origin surface.

## Configuration (build-time, no secrets)

| Variable | Purpose |
|---|---|
| `VITE_API_BASE` | portal API base path (default `/api/portal/v1`) |
| `VITE_DEFAULT_LOCALE` / `VITE_LOCALES` | localisation (`en`, `lv`) |
| `VITE_APP_TITLE` | product title / branding |

No authentication or client secrets ship in the bundle: login runs server-side
through the portal API, and the browser only ever holds the session cookie and the
anti-forgery token.

## Security posture

- No token, signing key, or refresh value is ever placed in the browser (no
  `localStorage`/`sessionStorage` token, none in app state) — only the http-only
  session cookie and the readable anti-forgery token.
- Every state-changing request echoes the anti-forgery token; cookies are
  `SameSite`.
- The login return validates its redirect target (same-origin paths only) to defend
  against open-redirect and replay.
- Server and validation content is rendered as data, never as HTML.
- Accessibility (WCAG 2.1 level AA) is a release requirement, not a finishing touch.
