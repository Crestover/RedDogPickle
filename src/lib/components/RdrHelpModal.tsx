"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

/**
 * RdrHelpModal — In-app "What is RDR?" explainer.
 *
 * 60-second mobile-friendly read explaining how ratings work.
 * Triggered by a link/button on the leaderboard page.
 * Links to the full /help page for deeper info.
 */

export default function RdrHelpModal() {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll to top whenever the modal opens
  useEffect(() => {
    if (open && contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline"
      >
        What is RDR?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => setOpen(false)}
        >
          <div
            ref={contentRef}
            className="relative w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white px-5 py-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-lg leading-none"
              aria-label="Close"
            >
              ✕
            </button>

            <div className="space-y-5">
              {/* Headline */}
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Red Dog Rating (RDR)
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Play games → ratings get smarter → leaderboard reflects reality.
                </p>
              </div>

              {/* How it works */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">How it works</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Every player starts at <strong>1200</strong>. Win and it goes up.
                  Lose and it goes down. Bigger wins against stronger teams matter more.
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  The more you play, the more accurate it gets.
                </p>
              </section>

              {/* Tiers */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">Tiers</h3>
                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold bg-gray-100 text-gray-600">Walk-On</span>
                  <span className="text-gray-300 text-xs">→</span>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold bg-blue-100 text-blue-700">Challenger</span>
                  <span className="text-gray-300 text-xs">→</span>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold bg-green-100 text-green-700">Contender</span>
                  <span className="text-gray-300 text-xs">→</span>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold bg-yellow-100 text-yellow-700">All-Star</span>
                  <span className="text-gray-300 text-xs">→</span>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold bg-red-100 text-red-700">Elite</span>
                </div>
                <p className="text-xs text-gray-500">
                  Quick labels so you don&apos;t have to compare numbers.
                </p>
              </section>

              {/* Confidence */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">Confidence</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Your rating <strong>never drops</strong> just because you stop playing.
                  Instead, the system tracks how confident it is in your number:
                </p>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-green-600 w-20">Locked In</span>
                    <span className="text-gray-500">Very reliable</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-500 w-20">Active</span>
                    <span className="text-gray-500">Solid</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-yellow-600 w-20">Rusty</span>
                    <span className="text-gray-500">Been a while</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-orange-500 w-20">Returning</span>
                    <span className="text-gray-500">Adjusts faster</span>
                  </div>
                </div>
              </section>

              {/* Doubles */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">How doubles work</h3>
                <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
                  <li>Uses team average rating</li>
                  <li>Reduces swings when partners are uneven</li>
                  <li>Gets more accurate with rotation over time</li>
                </ul>
              </section>

              {/* What this is */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">What this is (and isn&apos;t)</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  RDR is built for your regular group. It&apos;s not a universal rating
                  like DUPR &mdash; it&apos;s a home court rating that tells you exactly
                  where everyone stands among the people you actually play with.
                </p>
              </section>

              {/* CTA */}
              <div className="pt-2 space-y-2">
                <p className="text-xs text-gray-400">
                  Built for real games with real people &mdash; not theoretical rankings.
                </p>
                <Link
                  href="/help#rdr"
                  className="text-sm text-green-700 font-medium hover:text-green-800 transition-colors"
                  onClick={() => setOpen(false)}
                >
                  Learn how ratings work →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
