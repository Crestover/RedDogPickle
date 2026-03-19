"use client";

import { useState } from "react";
import type { ConfidenceLabel as ConfidenceLabelType } from "@/lib/rdr";
import { confidenceColor, confidenceHint } from "@/lib/rdr";

/**
 * ConfidenceLabel — Tappable confidence indicator with tooltip.
 *
 * Shows "Locked In" / "Active" / "Rusty" / "Returning" with a
 * tap-to-reveal tooltip explaining what the label means.
 * Links to the ratings guide for deeper understanding.
 */

interface ConfidenceLabelProps {
  label: ConfidenceLabelType;
}

export default function ConfidenceLabel({ label }: ConfidenceLabelProps) {
  const [showHint, setShowHint] = useState(false);

  return (
    <div className="relative text-right">
      <button
        onClick={() => setShowHint((prev) => !prev)}
        className={`text-[10px] font-medium ${confidenceColor(label)} hover:underline`}
        aria-label={`Confidence: ${label}`}
      >
        {label}
      </button>

      {showHint && (
        <>
          {/* Backdrop to close on outside tap */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowHint(false)}
          />
          {/* Tooltip */}
          <div className="absolute right-0 top-5 z-50 w-56 rounded-lg bg-gray-900 px-3 py-2.5 shadow-lg">
            <p className="text-xs text-gray-100 leading-relaxed">
              {confidenceHint(label)}
            </p>
            <a
              href="/help#rdr"
              className="mt-1.5 block text-[10px] text-green-400 font-medium hover:text-green-300"
            >
              Learn how ratings work →
            </a>
          </div>
        </>
      )}
    </div>
  );
}
