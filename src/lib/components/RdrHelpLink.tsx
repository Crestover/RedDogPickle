import Link from "next/link";

/**
 * RdrHelpLink — "What is RDR?" link for leaderboard headers.
 *
 * Links to the /rdr explainer page. Server component (no client JS).
 * Replaces the previous modal approach which had scroll issues on mobile.
 */
export default function RdrHelpLink() {
  return (
    <Link
      href="/rdr"
      className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline"
    >
      What is RDR?
    </Link>
  );
}
