"use client";

import { useState, useTransition } from "react";
import { voidLastGameAction } from "@/app/actions/games";

interface Props {
  sessionId: string;
  joinCode: string;
  /** Optional redirect path after voiding (e.g. courts page). Defaults to session page. */
  redirectPath?: string;
}

/**
 * 2-tap confirm button for voiding the most recent game in a session.
 * Pattern matches EndSessionButton (first tap = confirm prompt, second tap = execute).
 */
export default function VoidLastGameButton({
  sessionId,
  joinCode,
  redirectPath,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await voidLastGameAction("full", sessionId, joinCode, redirectPath);
      if (result?.error) {
        setError(result.error);
        setConfirming(false);
      }
      // On success the action redirects — no further client handling needed.
    });
  }

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
          confirming
            ? "bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-800 focus:ring-amber-500"
            : "border border-amber-300 bg-white text-amber-600 hover:bg-amber-50 active:bg-amber-100 focus:ring-amber-400"
        }`}
      >
        {isPending
          ? "Voiding…"
          : confirming
          ? "Confirm Void?"
          : "Void Last Game"}
      </button>

      {confirming && !isPending && (
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="block text-xs text-gray-400 hover:text-gray-600 transition-colors mt-1"
        >
          Cancel
        </button>
      )}

      {error && (
        <p className="text-xs text-red-600 font-medium mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
