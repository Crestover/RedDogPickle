import Link from "next/link";

/**
 * RdrHelpLink — "What is RDR?" link for leaderboard headers.
 *
 * Links to the /rdr explainer page with a `from` query param
 * so the back button returns to the correct leaderboard.
 */

interface RdrHelpLinkProps {
  /** Current page path (e.g. "/g/abc/leaderboard") for back navigation. */
  from?: string;
}

export default function RdrHelpLink({ from }: RdrHelpLinkProps) {
  const href = from
    ? `/rdr?from=${encodeURIComponent(from)}`
    : "/rdr";

  return (
    <Link
      href={href}
      className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline"
    >
      What is RDR?
    </Link>
  );
}
