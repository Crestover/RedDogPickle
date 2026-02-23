"use client";

import Link from "next/link";

interface Props {
  mode: "manual" | "courts";
  manualHref: string;
  courtsHref: string;
}

/**
 * Segmented mode toggle: Manual | Courts
 *
 * Source of truth is the current route, passed as `mode` prop.
 * No localStorage, no client state. Route always wins.
 */
export default function ModeToggle({ mode, manualHref, courtsHref }: Props) {
  return (
    <div
      role="tablist"
      className="grid grid-cols-2 rounded-xl border border-gray-200 bg-gray-50"
      style={{ height: "44px" }}
    >
      <Link
        role="tab"
        aria-selected={mode === "manual"}
        href={manualHref}
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
      </Link>
      <Link
        role="tab"
        aria-selected={mode === "courts"}
        href={courtsHref}
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
      </Link>
    </div>
  );
}
