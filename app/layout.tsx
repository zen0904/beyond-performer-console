import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./v452.css";

const basePath = process.env.GITHUB_ACTIONS ? "/beyond-performer-console" : "";

export const metadata: Metadata = {
  title: "BEYOND Performer",
  description: "iPad multi-touch digital performer console.",
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: [{ url: `${basePath}/favicon.svg`, type: "image/svg+xml" }],
    apple: [{ url: `${basePath}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "BEYOND Performer",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0b0d0b",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
