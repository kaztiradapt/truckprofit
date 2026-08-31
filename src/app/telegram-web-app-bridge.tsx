"use client";

import Script from "next/script";

type TelegramWebApp = {
  ready(): void;
  expand(): void;
  openTelegramLink(url: string): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function TelegramWebAppBridge() {
  function initializeTelegramWebApp() {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    document.documentElement.classList.add("telegram-mini-app");
    webApp.ready();
    webApp.expand();
    webApp.setHeaderColor("#14231e");
    webApp.setBackgroundColor("#f6f7f4");
  }

  return (
    <Script
      id="telegram-web-app-sdk"
      src="https://telegram.org/js/telegram-web-app.js?63"
      strategy="afterInteractive"
      onLoad={initializeTelegramWebApp}
    />
  );
}
