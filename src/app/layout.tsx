import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "../styles/globals.css";
import Faq from "./components/public/global/faq/Faq";
import Cta from "./components/public/global/Cta";
import Footer from "./components/public/global/footer/Footer";
import Header from "./components/public/global/Header";
import CursorBlob from "./components/ui/CursorBlob";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next"

// 1. Configuração de Viewport (Padrão Next.js 14+)
export const viewport: Viewport = {
  themeColor: "#000000", // Ajuste para a cor da Tecfy
  width: "device-width",
  initialScale: 1,
};

// 2. Transformação de todo o SEO do Angular para Metadata do Next.js
export const metadata: Metadata = {
  title: "Tecfy | Criação de Sites, Apps e IA",
  description: "Especialistas em desenvolvimento de Software, Apps, Sites e Inteligência Artificial. A Tecfy cria soluções digitais completas para transformar o seu negócio.",
  keywords: "desenvolvimento de software, software house, criação de aplicativos, desenvolvimento web, inteligência artificial para empresas, soluções em ia, tecfy, transformação digital, fábrica de software, desenvolvimento de sistemas, criar site profissional, empresa de tecnologia, desenvolvimento mobile, Brasil",
  authors: [{ name: "Tecfy" }],
  creator: "Tecfy",
  robots: { index: true, follow: true, googleBot: "index, follow" },
  alternates: {
    canonical: "https://www.tecfy.dev",
  },
  // Manifest para PWA
  manifest: "/manifest.json",
  // Geo targeting
  other: {
    "geo.position": "14.2350, -51.9253",
    "ICBM": "-14.2350, -51.9253",
    "geo.region": "BR",
    "geo.placename": "Brasil",
  },
  appleWebApp: {
    title: "Tecfy",
    statusBarStyle: "black-translucent",
    capable: true,
    startupImage: "/assets/og-image.jpg",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
    date: false,
    url: false,
  },
  // Open Graph (Facebook/LinkedIn)
  openGraph: {
    type: "website",
    siteName: "Tecfy",
    title: "Tecfy | Criação de Sites, Apps e IA",
    description: "Especialistas em desenvolvimento de Software, Apps, Sites e Inteligência Artificial. Conheça a Tecfy.",
    url: "https://www.tecfy.dev",
    images: [
      {
        url: "https://www.tecfy.dev/assets/og-image.jpg",
        width: 1200,
        height: 630,
        type: "image/jpeg",
      },
    ],
    locale: "pt_BR",
  },
  // Twitter
  twitter: {
    card: "summary_large_image",
    title: "Tecfy | Criação de Sites, Apps e IA",
    description: "Transforme seu negócio com Software, Apps e IA da Tecfy.",
    images: ["https://www.tecfy.dev/assets/og-image.jpg"],
    creator: "@tecfy.dev",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        {/* LLM Context File Reference */}
        <link rel="alternate" type="text/plain" href="/llm.txt" title="LLM Context" />

        {/* JSON-LD Schema.org Structured Data */}
        <Script id="schema-org" type="application/ld+json">
          {`{
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "@id": "https://www.tecfy.dev/#organization",
                "name": "Tecfy",
                "url": "https://www.tecfy.dev",
                "logo": "https://www.tecfy.dev/assets/visual-identity/logo-tecfy.svg",
                "description": "Especialistas em desenvolvimento de Software, Apps, Sites e Inteligência Artificial",
                "address": {
                  "@type": "PostalAddress",
                  "addressCountry": "BR"
                },
                "contactPoint": {
                  "@type": "ContactPoint",
                  "contactType": "Customer Support",
                  "url": "https://www.tecfy.dev/contato",
                  "areaServed": "BR"
                }
              },
              {
                "@type": "WebSite",
                "@id": "https://www.tecfy.dev/#website",
                "url": "https://www.tecfy.dev",
                "name": "Tecfy",
                "inLanguage": "pt-BR",
                "publisher": {"@id": "https://www.tecfy.dev/#organization"},
                "potentialAction": {
                  "@type": "SearchAction",
                  "target": "https://www.tecfy.dev/search?q={search_term_string}",
                  "query-input": "required name=search_term_string"
                }
              },
              {
                "@type": "LocalBusiness",
                "@id": "https://www.tecfy.dev/#localbusiness",
                "name": "Tecfy",
                "image": "https://www.tecfy.dev/assets/og-image.jpg",
                "description": "Software house com soluções em desenvolvimento, apps e IA para empresas brasileiras",
                "url": "https://www.tecfy.dev",
                "address": {
                  "@type": "PostalAddress",
                  "addressCountry": "BR",
                  "addressLocality": "Brasil"
                },
                "areaServed": "BR",
                "availableLanguage": "pt-BR"
              }
            ]
          }`}
        </Script>
      </head>
      <body className="antialiased">
        {/* 3. Scripts de Terceiros (Google Analytics & Adopt) */}
        
        {/* Adopt - Cookie Banner */}
        <Script
          src="https://tag.goadopt.io/injector.js?website_code=88b861e3-5ff3-4a6c-be05-82a2a90163f3"
          strategy="afterInteractive"
          className="adopt-injector"
        />

        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-JM2DKS9G1B"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-JM2DKS9G1B');
          `}
        </Script>

        <CursorBlob />

        <Header />
        <main>
          {children}
          <Faq />
          <Cta />
        </main>
        <Footer />
      </body>
    </html>
  );
}