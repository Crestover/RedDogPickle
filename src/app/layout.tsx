import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "RedDog Pickle",
  description: "Pickleball stats tracker",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased flex flex-col">
        <div className="flex-1">{children}</div>
        <footer className="py-4 text-center text-xs text-gray-400">
          v{process.env.NEXT_PUBLIC_APP_VERSION}
          <span className="mx-1">·</span>
          <Link href="/changelog_public" className="underline hover:text-gray-600 transition-colors">Changes</Link>
        </footer>
      </body>
    </html>
  );
}
