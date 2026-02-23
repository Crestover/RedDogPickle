import { readFile } from "fs/promises";
import { join } from "path";
import { marked } from "marked";
import Link from "next/link";

export const metadata = {
  title: "Changelog — RedDog Pickle",
};

/**
 * Escape HTML entities so raw HTML in the source cannot render.
 * This is a safety measure since we use dangerouslySetInnerHTML.
 */
function escapeHtml(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default async function ChangelogPage() {
  const filePath = join(process.cwd(), "CHANGELOG_PUBLIC.md");
  const raw = await readFile(filePath, "utf-8");

  // Pre-escape < and > before parsing so no raw HTML can render
  const escaped = escapeHtml(raw);
  const html = await marked(escaped);

  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <Link
          href="/"
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← Home
        </Link>

        <div
          className="[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4
            [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3
            [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1
            [&_li]:text-sm [&_li]:text-gray-700
            [&_hr]:my-6 [&_hr]:border-gray-200
            [&_p]:text-sm [&_p]:text-gray-600 [&_p]:mb-2
            [&_a]:text-green-600 [&_a]:underline
            [&_code]:text-xs [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
            [&_table]:w-full [&_table]:text-sm
            [&_th]:text-left [&_th]:text-gray-500 [&_th]:font-medium [&_th]:pb-1
            [&_td]:text-gray-700 [&_td]:py-0.5"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
