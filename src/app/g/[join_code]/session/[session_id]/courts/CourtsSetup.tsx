"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { initCourtsAction } from "@/app/actions/courts";

interface Props {
  sessionId: string;
  joinCode: string;
  attendeeCount: number;
}

export default function CourtsSetup({ sessionId, joinCode, attendeeCount }: Props) {
  const router = useRouter();
  const [courtCount, setCourtCount] = useState(() => {
    // Default: as many courts as we can fill with attendees (max 8)
    return Math.max(1, Math.min(Math.floor(attendeeCount / 4), 8));
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleInit() {
    setError(null);
    startTransition(async () => {
      const result = await initCourtsAction("full", sessionId, joinCode, courtCount);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error?.message ?? "Failed to initialize courts");
      }
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-700">Set Up Courts</h2>
      <p className="text-xs text-gray-500">
        Choose how many courts to use for this session.
        {attendeeCount > 0 && (
          <> You have <span className="font-semibold">{attendeeCount}</span> players
            {" "}({Math.floor(attendeeCount / 4)} full courts).</>
        )}
      </p>

      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600 font-medium">Courts:</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCourtCount((c) => Math.max(1, c - 1))}
            disabled={courtCount <= 1 || isPending}
            className="w-8 h-8 rounded-lg border border-gray-300 bg-white text-gray-700 font-bold text-lg flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            -
          </button>
          <span className="w-8 text-center text-lg font-bold font-mono">{courtCount}</span>
          <button
            type="button"
            onClick={() => setCourtCount((c) => Math.min(8, c + 1))}
            disabled={courtCount >= 8 || isPending}
            className="w-8 h-8 rounded-lg border border-gray-300 bg-white text-gray-700 font-bold text-lg flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            +
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleInit}
        disabled={isPending}
        className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Setting up..." : `Start with ${courtCount} Court${courtCount !== 1 ? "s" : ""}`}
      </button>

      {error && (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      )}
    </div>
  );
}
