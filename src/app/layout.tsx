import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import {
  GeistPixelCircle,
  GeistPixelGrid,
  GeistPixelLine,
  GeistPixelSquare,
  GeistPixelTriangle,
} from "geist/font/pixel";
import "./globals.css";

import { LocaleProvider } from "@/components/i18n/locale-context";
import { htmlLang } from "@/domain/locale/locale";
import { requestLocale } from "@/platform/locale/request-locale";

// Geist from the geist package, not Google Fonts: fonts.googleapis.com cannot be reached from a China
// server, and every page then fell back to another font (2026-11-27). Same CSS variable as before.
const geistSans = GeistSans;

const pageText = {
  en: { title: "Meri — Outdoor intelligence for every trip", description: "Your Personal Outdoor Intelligence Companion" },
  zh: { title: "Meri — 每一次出行的户外智能伙伴", description: "你的个人户外智能伙伴" },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const text = pageText[await requestLocale()];
  return { ...sharedMetadata, title: text.title, description: text.description };
}

/** Everything the page head carries in either language. */
const sharedMetadata: Metadata = {
  applicationName: "Meri",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/brand/meri-favicon.svg", type: "image/svg+xml" }],
    apple: [
      {
        url: "/brand/meri-app-icon-1024.png",
        sizes: "1024x1024",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Meri",
  },
};

export const viewport: Viewport = {
  themeColor: "#091326",
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await requestLocale();
  return (
    <html
      lang={htmlLang(locale)}
      className={`${geistSans.variable} ${GeistPixelSquare.variable} ${GeistPixelGrid.variable} ${GeistPixelCircle.variable} ${GeistPixelTriangle.variable} ${GeistPixelLine.variable}`}
    >
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
