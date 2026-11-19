# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Marketing website for Tecfy (a Brazilian software house). Single-language pt-BR site whose
primary job is lead generation: visitors browse plans, submit a contact form (protected by
Cloudflare Turnstile anti-bot verification), and land on a thank-you page where they can schedule
a meeting. Leads are written to Firebase Firestore via a Next.js Route Handler at `/api/leads`;
no external API is used.

## Commands

- **Dev server**: `npm run dev` → http://localhost:3000
- **Production build**: `npm run build` (not `npm build`)
- **Run production build**: `npm start`
- **Lint**: `npm run lint` / auto-fix: `npm run lint:fix`

There is no unit-test framework. **Stress/integrity tests**: `npm run stress` runs `scripts/stress/run.mts`
against a local **Firestore emulator** (project `demo-tecfy`; never production — the script aborts without
`FIRESTORE_EMULATOR_HOST`). Needs the global `firebase` CLI and **Java 21+** (`JAVA_HOME`). It calls the real
`crm/*` functions under heavy concurrency and checks invariants (no lost/duplicated/mixed data). Run it after
touching any transaction in `src/lib/admin/crm/`.

## Tech Stack

- **Next.js 16** (App Router) + **React 19**, **TypeScript 5**
- **Tailwind CSS 4** (via `@tailwindcss/postcss`), configured entirely in CSS — see theming below
- Default Next 16 bundler (Turbopack); `next.config.ts` is empty
- ESLint 9 + `eslint-config-next` 16 (flat config). ESLint 10 is **not** compatible with the
  bundled `eslint-plugin-react` — don't bump it.
- Fonts: local **InstrumentSans** loaded via `@font-face` in `src/styles/globals.css` (this repo
  does *not* use `next/font`; the README's mention of Geist is stale boilerplate)
- `swiper` (carousels), `react-icons` (plan/feature icons), `@calcom/embed-react` (scheduling)
- Analytics: Vercel Analytics + Speed Insights, Google Analytics/GTM and the Adopt.io cookie
  banner — all in `(public)/layout.tsx` (public site only, never in the admin)

## Architecture

### Routing
Two route groups (group names don't appear in the URL):
- `(public)` — `/` (home), `/contato`, `/thanks`, `/politicas/*` (privacidade, termos, cookies).
- `(admin)` — hidden admin panel, see "Admin panel" below.

`src/app/not-found.tsx` is the global 404 (rendered without the public chrome).

### Layout composition
- `src/app/layout.tsx` (root) only owns `<html>/<body>`, `globals.css`, global SEO metadata
  (Open Graph, Twitter, canonical) and the JSON-LD. **No visual chrome here.**
- `src/app/(public)/layout.tsx` wraps every public page with `<CursorBlob/>`, `<Header/>`,
  `<main>{children}<Faq/><Cta/></main>`, `<Footer/>`, plus GA/Adopt scripts and Vercel
  Analytics/SpeedInsights. FAQ and CTA therefore appear at the bottom of **every** public page —
  individual pages must not add their own, and must not render their own `<main>`.
- `Header` returns `null` on `/politicas/*` (that section has its own sidebar layout).

### Admin panel (hidden route)
- Pages live in `src/app/(admin)/internal-admin/` but are **never** served at `/internal-admin`.
  The public URL is `/${ADMIN_PATH}` (env var, server-only). `src/proxy.ts` rewrites
  `/${ADMIN_PATH}/*` → `/internal-admin/*` (adding `X-Robots-Tag: noindex`), returns 404 for direct
  `/internal-admin*` hits, and disables the panel entirely when `ADMIN_PATH` is unset.
- **Never commit the real slug** (not in code, docs, robots.txt or sitemap) and never expose it via
  `NEXT_PUBLIC_*`. Server components read it with `getAdminBasePath()` (`src/lib/adminPath.ts`)
  and pass it down as a `basePath` prop (links = `${basePath}/...`).
- Structure: `login/` (public login screen), `(app)/` (protected system — its `layout.tsx` calls
  `getAdminSession()` and redirects to `/login`), `api/session/*` (login API, reachable **only** at
  `/${ADMIN_PATH}/api/session...` — the root `/api` is not used for admin).
- `proxy.ts` also adds security headers to every admin response (CSP with per-request nonce,
  `X-Frame-Options: DENY`, `no-store`, HSTS, noindex) and redirects pages without the session
  cookie to `/login` (optimistic; real check is server-side).

### Admin authentication (security-critical — read before touching)
- **All Firebase Auth calls are server-side** via the Identity Toolkit REST API
  (`src/lib/admin/identityToolkit.ts`, key `FIREBASE_WEB_API_KEY`, never `NEXT_PUBLIC`). There is no
  Firebase client SDK. Flow: `POST api/session` (email + password + Turnstile action `admin_login`)
  → `{step:"mfa"}` or `{step:"enroll", qr, secret}` (first login enrolls TOTP) → `POST api/session/mfa`
  or `api/session/enroll` (6-digit code) → session cookie. `DELETE api/session` = logout (revokes
  refresh tokens).
- **2FA TOTP is mandatory**: `establishSession()` (`src/lib/admin/session.ts`) only mints the cookie if
  the ID token has `admin === true` and `firebase.sign_in_second_factor === "totp"`.
- Session = Firebase session cookie, 14 days (Firebase max), `HttpOnly; SameSite=Strict; Secure`,
  `__Host-` prefix in prod (`src/lib/admin/cookieNames.ts`). `getAdminSession()` verifies with
  `checkRevoked` + admin claim on every request.
- State between password and code lives in an AES-256-GCM encrypted HttpOnly cookie
  (`pendingCookie.ts`, key `ADMIN_PENDING_SECRET`), 5 min, max 5 attempts.
- Rate limit/lockout in Firestore `admin_rate_limits` (`rateLimit.ts`): IP 10 failures/15 min → 1 h
  lock + burst cap 30 req/10 min; email 5 failures/15 min → 30 min lock. Fails **closed**.
- Audit in Firestore `admin_login_logs` (`audit.ts`): every success/failure/lockout/logout with IP
  (`x-real-ip`/`x-forwarded-for`, never `cf-connecting-ip`) and Vercel geo headers. A successful
  login is undone if its audit write fails.
- Always return generic errors (`invalid_credentials`), never reveal whether the email exists.
- **Check order matters** (cost/DoS): gate/origin/JSON → input validation → Turnstile (or the
  encrypted pending cookie) → Firestore rate limit → Firebase Auth. Never touch Firestore before
  Turnstile. Lock keys: `ip_`, `emailip_` (5/15 min) and global `email_` (30/1 h) — see `rateLimit.ts`.
- **Proxy gate**: `proxy.ts` injects `x-admin-gate` (HMAC of `ADMIN_PENDING_SECRET`, `gate.ts`) and
  strips client copies; the admin layout and every admin route handler require it (404 otherwise).
  Any new admin route handler must go through `readGuardedJson`/`guardAdminRequest`.
- **Device-bound sessions**: besides the Firebase cookie there's a `sid` cookie →
  `admin_sessions/{sid}` with the UA hash. UA mismatch ⇒ refresh tokens revoked + `session_anomaly`.
  (A browser update changes the UA and forces a new login — expected.)
- **2FA enrollment window**: a QR code is only offered if the user has the `mfa_enroll_until` claim
  (set by `grant` / `allow-enroll` / `reset-2fa`, 30 min); it's removed right after enrollment.
- Pending cookie is bound to IP+UA (`attemptContextHash`) and carries a `jti`.
- Optional real-time alerts via `ADMIN_ALERT_WEBHOOK_URL` (Discord/Slack), sent with `after()`.
- Site-wide security headers live in `next.config.ts`; the admin additionally gets the nonce CSP.
- Access management: `scripts/admin-setup.mjs` (`enable-totp`, `grant`, `allow-enroll`, `revoke`,
  `reset-2fa`, `status`), run with `node --env-file=.env.local`.
- Turnstile verification is shared: `verifyTurnstile(token, ip, action)` in `src/lib/turnstile.ts`
  (also used by `/api/leads`). `TurnstileWidget` takes an `action` prop.

### The lead-capture flow (the core feature — spans several files)
1. **Plan selection** — `components/public/home/plans/PlansCards.tsx`: each "Assinar {plan}" button
   calls `router.push('/contato?plan=<planName>')`.
2. **Contact page** — `(public)/contato/page.tsx`: reads the `?plan` query param via
   `useSearchParams` and passes it to `<Form selectedPlan={...}/>`.
3. **Form submit** — `components/public/contato/Form.tsx`: validates client-side, then calls
   `insertLead()` (`services/leads/insertLead.ts`), which POSTs a `LeadRequest`
   (`{ lead_name, lead_email, lead_phone, interest_plan, turnstile_token }`) to `/api/leads`.
4. **Success** — the form writes `{ lead_name, lead_email }` to `sessionStorage` under the key in
   `src/lib/contactThanksSession.ts` (`tecfy_contact_thanks`), then `router.push('/thanks')`.
5. **Thank-you page** — `(public)/thanks/page.tsx` is **gated by that sessionStorage key**: if the
   key is missing it redirects to `/contato`. When present, it prefills the Cal.com embed
   (`tecfydev/briefing-sem-modestia`, namespace `30min`) with the lead's name/email.

Cal.com scheduling lives **only on `/thanks`**, not on the contact form.

Error handling: `insertLead` throws `LeadInsertError` carrying the HTTP status. `Form.tsx` maps
status → `ApiFeedbackModal` type: **409 → conflict**, **429 → rate_limit**, otherwise **error**.

### Service layer & lead capture
`src/services/leads/insertLead.ts` POSTs lead data (including a Cloudflare Turnstile token) to
the local `/api/leads` endpoint. Request/response types live in `src/services/types.ts`. The
Route Handler (`src/app/api/leads/route.ts`) validates input, verifies the Turnstile token
against Cloudflare, and writes to Firestore via `getAdminDb()` from `src/lib/firebaseAdmin.ts`
(lazy init — call it inside the request handler, never at module top level, or `next build`
breaks when Firebase env vars are absent).
Turnstile is verified server-side; the token is single-use and must be reset after each submit
attempt. Each submission creates a **contact** (`contacts`) plus a **lead** (`leads`, `schema_version: 2`,
`entry: "website"`) linked to it. A known e-mail is **not** rejected anymore: the return is logged as a
system note on that contact's latest lead + a `lead_returned` notification/e-mail (the API no longer returns 409;
the 409 branch in `Form.tsx` is now unused).

### Admin CRM (Firestore)
- Model in `src/lib/admin/crm/types.ts`: `leads` (an opportunity; `entry` = `manual`|`website`, set
  server-side only), `contacts`, `companies`, `contracts`, `products`. Select options (stage, source…)
  live in `src/lib/admin/crm/options.ts`; shared client/server validation in `crm/validation.ts`.
- Manual lead creation: `CreateLeadModal` → `POST ${basePath}/api/crm/leads` (gate + session) →
  `createManualLead()` writes company → contact → lead in one transaction.
- **Request budget (keep it low)**: reads go through `crm/cache.ts` (`unstable_cache`, tags `crm-*`); every
  write route calls `invalidateCrm(...)` with `revalidateTag(tag, { expire: 0 })`. The leads list is cached in
  pages of 1,500 (cursor = created_at nanos + doc id; Next's cache rejects items > 2 MB), limit 5,000.
  `LeadsView` never `router.refresh()`es after an action: routes return what changed and the view keeps a local
  layer (`patches`/`added`/`removed`) over the server list, reset when a new list arrives ("Atualizar lista").
  Contact/company pickers load on demand (`GET …/api/crm/options`, `crmOptionsStore`); the drawer loads
  notes + e-mails in one `GET …/api/crm/leads/[id]/activity`, kept per lead in memory. The bell polls
  `?since=` only while the tab is visible.
- **Transactions: point reads only, never queries** (queries lock index ranges and deadlock under load — proven
  by the stress test). Contact e-mail uniqueness = `contact_emails/{sha256}` → `{ contact_id, latest_lead_id }`
  (`crm/contactIndex.ts`); `ensureEmailIndex` repairs legacy contacts *before* the transaction. Website
  submissions: `crm/websiteLead.ts` (`registerWebsiteLead`). Manual create is idempotent (`request_id` → lead id
  `m_<uuid>`). Notes are plain creates (no transaction, no write to the lead doc). Bulk ops are transactions that
  skip vanished leads. `crm-setup.mjs backfill-email-index [--apply]` indexes pre-existing contacts.
- Leads list (`LeadsView`): search/filters/sort/pagination run client-side over the loaded leads.
  Row and bulk actions go to `POST ${basePath}/api/crm/leads/bulk` (`set_qualification|set_stage|
  set_status|set_owner|convert|delete`, ≤200 ids). `convert` creates a minimal `deals/{id}` and marks the lead
  (`deal_id`, `converted_at`); `delete` removes only the lead, never its contact/company.
- Lead details are read-only by design (no editing of saved data). Notes are an append-only timeline in
  `leads/{id}/notes` (author + server time), via `GET/POST …/api/crm/leads/[id]/notes` (`crm/notes.ts`).
- New website lead → `/api/leads` writes an `admin_notifications` doc in the same transaction (bell in the
  sidebar, `NotificationBell`, polls `GET …/api/notifications?since=` every 60 s while visible; per-user `read_by`) and, via
  `after()`, `notifyNewWebsiteLead()` e-mails `LEAD_NOTIFY_EMAIL` (default contato@tecfy.dev) with the
  phone + WhatsApp link, plus the optional Discord/Slack webhook. The panel URL is never put in e-mails.
- Owner assignment = bulk action `set_owner` (also in the details drawer); linking a contact/company to a lead
  that has none = `POST …/api/crm/leads/[id]/links` (never replaces an existing link). Both write a
  `kind: "system"` note to the lead timeline.
- Message templates: built-ins in code (`BUILTIN_TEMPLATES`, read-only) + custom ones in
  `message_templates` (`POST …/api/crm/templates`).
- `scripts/crm-setup.mjs migrate-leads [--apply]` converts pre-v2 website leads (dry-run by default).
- Don't seed or edit `products` — the user manages that.

### Theming (Tailwind v4, CSS-first)
There is **no `tailwind.config.js`**. All design tokens are CSS variables defined in
`src/styles/globals.css`: raw values in `:root`, then re-exported to Tailwind via the `@theme`
block as `--color-*` / `--font-*`. This generates custom utility classes used throughout the app —
e.g. `bg-background-secondary`, `text-text-primary`, `text-secondary`, `border-border-primary`.
When adding UI, use these token classes instead of hardcoded hex/Tailwind palette colors. The site
is a fixed dark theme (black background); there is no light-mode toggle.

### Pricing display
`plans/PlansCardsData.ts` stores each plan's monthly price, displayed as-is (no discount). Plans with `pricePlan: null` render `priceLabel` (e.g. "SOB CONSULTA") instead.
Only the plan **name** string is sent to the API as `interest_plan`.

### Data colocation
Static content lives in `*Data.ts` files next to the component that renders it — e.g.
`FaqData.ts`, `TestimonialsPersonsData.ts`, `PlansCardsData.ts`, `footerData.ts`. Edit content
there rather than inline in JSX.

## Conventions & gotchas

- **`src/shemas/` is misspelled** (should be "schemas") but the folder name and the import path
  `@/shemas/validationSchema` are consistent across the code — do not "fix" it without updating
  imports. It contains `validateEmail` / `validatePhone` / `validateOTP`.
- Phone input uses `maskPhoneNumber` from `src/utils/masks.ts` (Brazilian `(NN) NNNNN-NNNN` format).
- Path alias `@/*` maps to `src/*`.
- Components that use hooks (`useSearchParams`, `useRouter`, `useState`) are `"use client"`;
  section/data components are server components by default.
- UI text is in Portuguese (pt-BR); keep new user-facing copy in Portuguese.
- Home sections are spaced with the `gap-[64px] lg:gap-[128px]` pattern in `(public)/page.tsx` —
  follow it when adding a new section.
- Deployed on Vercel; environment variables are managed in the Vercel dashboard. The full list is
  in `.env.example` (copy to `.env.local` for local dev).
- Known lint errors (pre-existing, `react-hooks/set-state-in-effect`) in `Form.tsx`,
  `thanks/page.tsx` and `Header.tsx`.
