"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  joinCode: string;
  courtsHref: string;
}

type Mode = "manual" | "courts";

function storageKey(joinCode: string) {
  return `session_mode_${joinCode}`;
}

export default function ModeToggle({ joinCode, courtsHref }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("manual");

  // Read persisted mode on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey(joinCode));
      if (stored === "courts") setMode("courts");
    } catch {
      // localStorage unavailable — keep default
    }
  }, [joinCode]);

  function handleSelect(next: Mode) {
    setMode(next);
    try {
      localStorage.setItem(storageKey(joinCode), next);
    } catch {
      // localStorage unavailable
    }
    if (next === "courts") {
      router.push(courtsHref);
    }
  }

  return (
    <div
      role="tablist"
      className="grid grid-cols-2 rounded-xl border border-gray-200 bg-gray-50"
      style={{ height: "44px" }}
    >
      <button
        role="tab"
        aria-selected={mode === "manual"}
        type="button"
        onClick={() => handleSelect("manual")}
        className={`flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition-all duration-150 ${
          mode === "manual"
            ? "bg-white shadow-sm border border-gray-200 text-gray-900 z-10"
            : "text-gray-400 hover:text-gray-600 cursor-pointer"
        }`}
      >
        {mode === "manual" && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-700" />
        )}
        Manual
      </button>
      <button
        role="tab"
        aria-selected={mode === "courts"}
        type="button"
        onClick={() => handleSelect("courts")}
        className={`flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition-all duration-150 ${
          mode === "courts"
            ? "bg-white shadow-sm border border-gray-200 text-gray-900 z-10"
            : "text-gray-400 hover:text-gray-600 cursor-pointer"
        }`}
      >
        {mode === "courts" && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        )}
        Courts
      </button>
    </div>
  );
}
