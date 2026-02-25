"use client";

import { useState, useTransition } from "react";
import { endSessionAction } from "@/app/actions/sessions";

interface Props {
  sessionId: string;
  joinCode: string;
}

export default function EndSessionButton({ sessionId, joinCode }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirming) {
      // First tap: ask for confirmation
      setConfirming(true);
      return;
    }
    // Second tap: confirmed — call the action
    setError("");
    startTransition(async () => {
      const result = await endSessionAction("full", sessionId, joinCode);
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
            ? "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus:ring-red-500"
            : "border border-red-300 bg-white text-red-600 hover:bg-red-50 active:bg-red-100 focus:ring-red-400"
        }`}
      >
        {isPending
          ? "Ending…"
          : confirming
          ? "Confirm?"
          : "End"}
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
