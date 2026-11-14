"use client";

import Script from "next/script";
import {
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          theme: "light" | "dark";
          action?: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export interface TurnstileWidgetHandle {
  reset: () => void;
}

type TurnstileWidgetProps = {
  onTokenChange: (token: string | null) => void;
  /** Action validada no servidor (cada formulário usa a sua). */
  action?: string;
};

const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  ({ onTokenChange, action = "contact_form_submit" }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);

    const renderWidget = useCallback(() => {
      // Só renderiza quando o script do Cloudflare já carregou e o container existe.
      if (!window.turnstile || !containerRef.current) return;
      // Evita renderizar duas vezes (onLoad do Script + navegação com script em cache).
      if (widgetIdRef.current !== null) return;

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!,
        theme: "dark",
        action,
        callback: (token: string) => {
          onTokenChange(token);
        },
        "error-callback": () => {
          onTokenChange(null);
        },
        "expired-callback": () => {
          onTokenChange(null);
        },
      });
    }, [onTokenChange, action]);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
          onTokenChange(null);
        }
      },
    }));

    return (
      <>
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          onLoad={renderWidget}
          onReady={renderWidget}
        />
        <div ref={containerRef} className="flex justify-center md:justify-start" />
      </>
    );
  }
);

TurnstileWidget.displayName = "TurnstileWidget";

export default TurnstileWidget;
