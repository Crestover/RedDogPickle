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
      const result = await endSessionAction(sessionId, joinCode);
      if (result?.error) {
        setError(result.error);
        setConfirming(false);
      }
      // On success the action redirects — no further client handling needed.
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={`flex w-full items-center justify-center rounded-xl px-4 py-4 text-base font-semibold shadow-sm transition-colors min-h-[56px] focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
          confirming
            ? "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus:ring-red-500"
            : "border border-red-300 bg-white text-red-600 hover:bg-red-50 active:bg-red-100 focus:ring-red-400"
        }`}
      >
        {isPending
          ? "Ending session…"
          : confirming
          ? "⚠️ Confirm End Session"
          : "End Session"}
      </button>

      {confirming && !isPending && (
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="block w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
        >
          Cancel
        </button>
      )}

      {error && (
        <p className="text-sm text-red-600 font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
