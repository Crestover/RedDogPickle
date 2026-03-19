"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ConfidenceLabel as ConfidenceLabelType } from "@/lib/rdr";
import { confidenceColor, confidenceHint } from "@/lib/rdr";

/**
 * ConfidenceLabel — Tappable confidence indicator with tooltip.
 *
 * Shows "Locked In" / "Active" / "Rusty" / "Returning" with a
 * tap-to-reveal tooltip explaining what the label means.
 * Links to the ratings guide for deeper understanding.
 *
 * Uses fixed positioning for the tooltip to escape any parent
 * overflow/stacking context (player cards clip absolutely-positioned children).
 */

interface ConfidenceLabelProps {
  label: ConfidenceLabelType;
}

export default function ConfidenceLabel({ label }: ConfidenceLabelProps) {
  const [showHint, setShowHint] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; right: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setTooltipPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
  }, []);

  useEffect(() => {
    if (showHint) {
      updatePosition();
    }
  }, [showHint, updatePosition]);

  return (
    <div className="text-right">
      <button
        ref={buttonRef}
        onClick={() => setShowHint((prev) => !prev)}
        className={`text-[10px] font-medium ${confidenceColor(label)} hover:underline`}
        aria-label={`Confidence: ${label}`}
      >
        {label}
      </button>

      {showHint && tooltipPos && (
        <>
          {/* Backdrop to close on outside tap */}
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setShowHint(false)}
          />
          {/* Tooltip — fixed position to escape card overflow */}
          <div
            className="fixed z-[70] w-56 rounded-xl bg-white border border-gray-200 px-3.5 py-3 shadow-lg"
            style={{ top: tooltipPos.top, right: tooltipPos.right }}
          >
            <p className="text-xs text-gray-700 leading-relaxed">
              {confidenceHint(label)}
            </p>
            <a
              href="/help#rdr"
              className="mt-2 block text-[11px] text-green-700 font-medium hover:text-green-800"
            >
              Learn how ratings work →
            </a>
          </div>
        </>
      )}
    </div>
  );
}
