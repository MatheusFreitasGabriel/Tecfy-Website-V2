import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "../styles/globals.css";
import Faq from "./components/public/global/faq/Faq";
import Cta from "./components/public/global/Cta";
import Footer from "./components/public/global/footer/Footer";
import Header from "./components/public/global/Header";

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
  keywords: "desenvolvimento de software, software house, criação de aplicativos, desenvolvimento web, inteligência artificial para empresas, soluções em ia, tecfy, transformação digital, fábrica de software, desenvolvimento de sistemas, criar site profissional, empresa de tecnologia, desenvolvimento mobile",
  authors: [{ name: "Tecfy" }],
  robots: { index: true, follow: true },
  alternates: {
    canonical: "https://www.tecfy.dev",
  },
  appleWebApp: {
    title: "Tecfy",
    statusBarStyle: "default",
    capable: true,
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
        url: "https://www.tecfy.dev/assets/og-image.png",
        width: 1200,
        height: 630,
      },
    ],
    locale: "pt_BR",
  },
  // Twitter
  twitter: {
    card: "summary_large_image",
    title: "Tecfy | Criação de Sites, Apps e IA",
    description: "Transforme seu negócio com Software, Apps e IA da Tecfy.",
    images: ["https://www.tecfy.dev/assets/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
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