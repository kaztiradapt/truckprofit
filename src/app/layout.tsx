import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Fleet Economics",
  description: "Unit economics for small transport fleets",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

