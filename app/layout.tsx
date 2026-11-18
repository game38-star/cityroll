
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

// ==========================================
// CITYROLL — KONFIGURACJA APLIKACJI
// ==========================================

export const metadata: Metadata = {
  title: "CityRoll",
  description: "CityRoll — mobilna gra planszowa ze znajomymi.",
  applicationName: "CityRoll",
  appleWebApp: {
    capable: true,
    title: "CityRoll",
    statusBarStyle: "black-translucent",
  },
};

// ==========================================
// USTAWIENIA EKRANU TELEFONU
// ==========================================

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080d1d",
};

// ==========================================
// GŁÓWNY UKŁAD APLIKACJI
// ==========================================

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
