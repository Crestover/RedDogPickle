"use client";

import { useState, useCallback } from "react";

interface Props {
  viewCode: string;
}

/**
 * Small text button that copies the view-only link to clipboard.
 * Uses NEXT_PUBLIC_SITE_URL for the base URL (matches OG image pattern).
 */
export default function CopyViewLink({ viewCode }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const url = `${base}/v/${viewCode}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: do nothing — clipboard API may not be available
    }
  }, [viewCode]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs text-gray-400 hover:text-gray-600 transition-colors text-left"
    >
      {copied ? "Copied!" : "📋 Copy view-only link"}
    </button>
  );
}
