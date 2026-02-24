import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Red Dog",
  description: "Keep score. Keep bragging rights.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-icon.png",
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
