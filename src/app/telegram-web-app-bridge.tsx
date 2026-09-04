"use client";

import Script from "next/script";

type TelegramWebApp = {
  initData: string;
  isVersionAtLeast(version: string): boolean;
  ready(): void;
  expand(): void;
  openTelegramLink(url: string): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor?(color: string): void;
  disableVerticalSwipes?(): void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function TelegramWebAppBridge() {
  function initializeTelegramWebApp() {
    const webApp = window.Telegram?.WebApp;
    // Скрипт Telegram создаёт WebApp и в обычном браузере, но без подписанного
    // initData это не Mini App. Не применяем Telegram-стили к обычному сайту.
    if (!webApp?.initData) return;
    document.documentElement.classList.add("telegram-mini-app");
    webApp.ready();
    webApp.expand();
    if (webApp.isVersionAtLeast("6.1")) {
      webApp.setHeaderColor("#14231e");
      webApp.setBackgroundColor("#f6f7f4");
    }
    if (webApp.isVersionAtLeast("7.10")) webApp.setBottomBarColor?.("#f6f7f4");
    if (webApp.isVersionAtLeast("7.7")) webApp.disableVerticalSwipes?.();
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
