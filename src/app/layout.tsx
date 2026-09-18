import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "Meri",
  title: "Meri — Outdoor intelligence for every trip",
  description: "Your Personal Outdoor Intelligence Companion",
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={geistSans.variable}>
      <body>{children}</body>
    </html>
  );
}
