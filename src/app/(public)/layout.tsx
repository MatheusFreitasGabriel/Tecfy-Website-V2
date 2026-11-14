import Script from "next/script";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import Faq from "../components/public/global/faq/Faq";
import Cta from "../components/public/global/Cta";
import Footer from "../components/public/global/footer/Footer";
import Header from "../components/public/global/Header";
import CursorBlob from "../components/ui/CursorBlob";

/**
 * Layout do site público. Tudo que é "casca" do site institucional mora aqui
 * (Header, FAQ, CTA, Footer, cursor e scripts de terceiros), para que outras
 * áreas — como o painel administrativo — não herdem esses elementos.
 */
export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
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

      {/* Vercel */}
      <Analytics />
      <SpeedInsights />
    </>
  );
}
