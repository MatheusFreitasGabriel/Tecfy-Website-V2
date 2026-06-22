# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

### Development Commands
- **Start dev server**: `npm run dev` (runs on http://localhost:3000)
- **Build for production**: `npm build`
- **Run production build**: `npm start`
- **Lint code**: `npm run lint`
- **Fix linting issues**: `npm run lint:fix`

## Tech Stack

- **Framework**: Next.js 16 with React 19 (Server/Client Components)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4 with PostCSS
- **Linting**: ESLint 10 with Next.js core-web-vitals and TypeScript rules
- **Analytics**: Vercel Analytics + Speed Insights
- **Third-party integrations**: 
  - Cal.com embed for scheduling (calendars)
  - Adopt.io for cookie banners
  - Google Analytics (GTM)

## Project Structure

```
src/
├── app/
│   ├── (public)/              # Public routes using route groups
│   │   ├── page.tsx           # Home page (/)
│   │   ├── contato/           # Contact page
│   │   ├── thanks/            # Thank you page (post-contact form)
│   │   └── politicas/         # Legal pages (privacy, terms, cookies)
│   ├── (admin)/               # Admin routes (in progress)
│   ├── components/            # Reusable components
│   │   ├── public/            # Components used on public pages
│   │   │   ├── home/          # Home page sections (Hero, HowWorks, Cases, Plans, Testimonials)
│   │   │   ├── global/        # Shared layout components (Header, Footer, FAQ, CTA)
│   │   │   └── contato/       # Contact form components
│   │   └── ui/                # Reusable UI components (Button, Input, CardTilt)
│   ├── layout.tsx             # Root layout with metadata, scripts, and header/footer
│   └── [various metadata files]
├── services/                  # External API and service calls
│   ├── api/                   # API configuration
│   └── leads/                 # Lead management endpoints
├── lib/                       # Utilities
├── styles/                    # Global CSS
└── schemas/                   # Validation schemas
public/
├── assets/                    # Images, fonts, logos, case study assets
└── [robots.txt, sitemap.xml]
```

## Key Architecture Decisions

### Route Groups
The app uses Next.js route groups `(public)` and `(admin)` to organize pages without affecting the URL structure. This keeps related pages together logically while maintaining clean URLs.

### Layout Composition
The root layout (`src/app/layout.tsx`) wraps all pages with:
- Global metadata and SEO configuration (with Open Graph, Twitter cards, canonical URLs)
- Analytics scripts (Google Analytics, Vercel Speed Insights)
- Shared layout components (Header, Footer, FAQ section, CTA section)
- This means child pages only need to define their own unique content

### Component Organization
- **Public components** live in `src/app/components/public/` and are grouped by page section or feature
- **UI components** in `src/app/components/ui/` are atomic, reusable building blocks
- Data (e.g., testimonials, plans, FAQ items) is typically colocated near its display component as `.ts` files (e.g., `TestimonialsPersonsData.ts`)

### Service Layer
API calls are centralized in `src/services/` to avoid scattered fetch calls. The leads service handles form submissions to external endpoints.

## Development Notes

### Styling
- Uses Tailwind CSS v4 with PostCSS. Global styles in `src/styles/globals.css`
- Custom utility components like `CardTilt` (interactive tilt effect) show Tailwind + Component patterns

### SEO & Metadata
- All SEO configuration is done via Next.js `Metadata` API in the root layout
- OG images and social sharing handled centrally
- Sitemap and robots.txt in `public/`

### Forms & External Services
- Contact form integrates with Cal.com embed for scheduling
- Forms likely post to an external API (check `src/services/api/apiConfig.ts` for endpoints)
- Admin panel is under construction (check `src/app/(admin)/`)

### Performance
- Vercel Analytics and Speed Insights are integrated for monitoring
- Images are optimized in `public/assets/` (primarily .webp format)
- Custom fonts loaded from `public/assets/fonts/`

## Common Workflows

### Adding a New Page
1. Create file in `src/app/(public)/[page-name]/page.tsx`
2. Export a default component with your page content
3. The root layout automatically applies Header, Footer, FAQ, and CTA sections
4. Add metadata in the component if page-specific SEO is needed

### Adding a New Section to Home
1. Create component file in `src/app/components/public/home/[section-name]/`
2. Import and add to `src/app/(public)/page.tsx`
3. Follow the gap spacing pattern already in use (`gap-[128px] lg:gap-[256px]`)

### Updating Components
- Keep component files co-located with their sections
- Data files (like `FaqData.ts`, `TestimonialsPersonsData.ts`) store content and can be easily updated
- Use TypeScript types from `src/schemas/` and `src/services/types.ts` for form validation and API data

## Linting & Code Quality

- ESLint runs on all TypeScript and React files
- Config extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
- Run `npm run lint:fix` to auto-fix issues before committing

## Deployment

- Deployed to Vercel (indicated by Speed Insights and Analytics integrations)
- Environment variables likely managed via Vercel dashboard
- Any API endpoints are checked in `src/services/api/apiConfig.ts`
