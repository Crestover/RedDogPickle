import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";

export const metadata: Metadata = {
  title: "Red Dog \u2013 A Proper Record for a Plastic Ball.",
  description:
    "Mobile-first pickleball scoring for real friend groups. Fast. Courtside. No login required.",
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: siteUrl,
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Red Dog \u2013 A Proper Record for a Plastic Ball.",
    description: "Mobile-first pickleball scoring for real friend groups.",
    url: siteUrl,
    siteName: "Red Dog",
    type: "website",
    images: [
      {
        url: new URL(
          "/PlayRedDog_ProperRecord_1200x630px.png",
          siteUrl
        ).toString(),
        width: 1200,
        height: 630,
        alt: "Red Dog \u2013 A Proper Record for a Plastic Ball.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Red Dog \u2013 A Proper Record for a Plastic Ball.",
    description: "Mobile-first pickleball scoring for real friend groups.",
    images: [
      new URL("/PlayRedDog_ProperRecord_1200x630px.png", siteUrl).toString(),
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-gray-50 text-gray-900 antialiased flex flex-col">
        <Analytics />
        <main className="flex-1 flex flex-col">{children}</main>
        <footer className="mt-auto pb-6 pt-8 text-center text-xs text-gray-400">
          <div className="space-y-1">
            <div>
              <Link href="/help" className="hover:text-gray-600 transition-colors">Learn more →</Link>
            </div>
            <div>
              v{process.env.NEXT_PUBLIC_APP_VERSION}
              <span className="mx-1">·</span>
              <Link href="/changelog_public" className="underline hover:text-gray-600 transition-colors">Changes</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
