import type { Metadata } from "next";
import "./styles.css";
import { TelegramWebAppBridge } from "./telegram-web-app-bridge";

export const metadata: Metadata = {
  title: {
    default: "TruckProfit",
    template: "%s · TruckProfit",
  },
  description: "Экономика рейсов и автопарка для транспортной компании",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <TelegramWebAppBridge />
        {children}
      </body>
    </html>
  );
}
