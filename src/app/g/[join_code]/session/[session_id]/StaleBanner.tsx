"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { endSessionAction } from "@/app/actions/sessions";

interface Props {
  isStale: boolean;
  sessionId: string;
  joinCode: string;
}

/**
 * Stale Session Banner — UI only.
 *
 * Shown when a session is still ACTIVE but has had no games
 * recorded for 24+ hours. Does NOT block scoring or auto-end.
 */
export default function StaleBanner({ isStale, sessionId, joinCode }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  if (!isStale || dismissed) return null;

  function handleEndSession() {
    setError("");
    startTransition(async () => {
      const result = await endSessionAction(sessionId, joinCode);
      if (result?.error) setError(result.error);
      // On success the action redirects
    });
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 space-y-3">
      <p className="text-sm font-semibold text-amber-800">
        This session looks old. What would you like to do?
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Resume
        </button>

        <button
          type="button"
          onClick={() => router.push(`/g/${joinCode}/start`)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Start New Session…
        </button>

        <button
          type="button"
          onClick={handleEndSession}
          disabled={isPending}
          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {isPending ? "Ending…" : "End Session"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      )}
    </div>
  );
}
