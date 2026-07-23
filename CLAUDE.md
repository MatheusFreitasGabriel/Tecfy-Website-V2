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

There is no test framework configured — no test runner, no test scripts.

## Tech Stack

- **Next.js 16** (App Router) + **React 19**, **TypeScript 5**
- **Tailwind CSS 4** (via `@tailwindcss/postcss`), configured entirely in CSS — see theming below
- **Turbopack is explicitly disabled** in `next.config.ts` (`experimental.turbopack: false`)
- Fonts: local **InstrumentSans** loaded via `@font-face` in `src/styles/globals.css` (this repo
  does *not* use `next/font`; the README's mention of Geist is stale boilerplate)
- `swiper` (carousels), `react-icons` (plan/feature icons), `@calcom/embed-react` (scheduling)
- Analytics: Vercel Analytics + Speed Insights (in `layout.tsx`), plus Google Analytics/GTM and
  the Adopt.io cookie banner injected as `<Script>` tags in `layout.tsx`

## Architecture

### Routing
Only one route group exists: `(public)`. It uses Next.js route groups purely for organization —
the group name does not appear in the URL. Routes: `/` (home), `/contato`, `/thanks`,
and `/politicas/*` (privacidade, termos, cookies). There is **no admin area** — an `(admin)`
group existed previously but has been removed; ignore any references to it.

### Layout composition
`src/app/layout.tsx` is the single root layout and wraps every page with, in order:
`<Header/>`, then `<main>{children}<Faq/><Cta/></main>`, then `<Footer/>`. This means the FAQ and
CTA sections appear at the bottom of **every** page automatically — individual pages must not add
their own. It also owns all global SEO metadata (Open Graph, Twitter, canonical) and the
third-party `<Script>` injections.

### The lead-capture flow (the core feature — spans several files)
1. **Plan selection** — `components/public/home/plans/PlansCards.tsx`: each "Assinar {plan}" button
   calls `router.push('/contato?plan=<planName>')`.
2. **Contact page** — `(public)/contato/page.tsx`: reads the `?plan` query param via
   `useSearchParams` and passes it to `<Form selectedPlan={...}/>`.
3. **Form submit** — `components/public/contato/Form.tsx`: validates client-side, then calls
   `insertLead()` (`services/leads/insertLead.ts`), which POSTs a `LeadRequest`
   (`{ lead_name, lead_email, lead_phone, interest_plan }`) to `/leads/insert`.
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
against Cloudflare, and writes to Firestore via the Admin SDK singleton at `src/lib/firebaseAdmin.ts`.
Turnstile is verified server-side; the token is single-use and must be reset after each submit
attempt.

### Theming (Tailwind v4, CSS-first)
There is **no `tailwind.config.js`**. All design tokens are CSS variables defined in
`src/styles/globals.css`: raw values in `:root`, then re-exported to Tailwind via the `@theme`
block as `--color-*` / `--font-*`. This generates custom utility classes used throughout the app —
e.g. `bg-background-secondary`, `text-text-primary`, `text-secondary`, `border-border-primary`.
When adding UI, use these token classes instead of hardcoded hex/Tailwind palette colors. The site
is a fixed dark theme (black background); there is no light-mode toggle.

### Pricing display
`plans/PlansCardsData.ts` stores each plan's **base** monthly price. `PlansCards.tsx` computes the
displayed price at render time as a **25% discount** (`pricePlan * 0.75`) and shows the original
struck through. Plans with `pricePlan: null` render `priceLabel` (e.g. "SOB CONSULTA") instead.
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
- Home sections are spaced with the `gap-[128px] lg:gap-[256px]` pattern in `(public)/page.tsx` —
  follow it when adding a new section.
- Deployed on Vercel; environment variables (`NEXT_PUBLIC_*`) are managed in the Vercel dashboard.
