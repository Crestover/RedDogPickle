import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What is RDR? — Red Dog",
};

/**
 * RDR explainer page — 60-second mobile-friendly read.
 *
 * Linked from leaderboard "What is RDR?" and confidence tooltips.
 * Follows the same layout pattern as /help.
 */
export default function RdrPage() {
  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* Back link — goes to browser back since we don't know the source */}
        <Link
          href="/help"
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          &larr; Help
        </Link>

        <h1 className="text-2xl font-bold">Red Dog Rating (RDR)</h1>

        <p className="text-sm text-gray-500">
          Play games → ratings get smarter → leaderboard reflects reality.
        </p>

        {/* How it works */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">How it works</h2>
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
          <h2 className="text-base font-semibold text-gray-900">Tiers</h2>
          <div className="flex flex-wrap gap-1.5 items-center">
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
          <h2 className="text-base font-semibold text-gray-900">Confidence</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Your rating <strong>never drops</strong> just because you stop playing.
            Instead, the system tracks how confident it is in your number:
          </p>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-green-600 w-20">Locked In</span>
              <span className="text-gray-500">Playing regularly. Very reliable.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-500 w-20">Active</span>
              <span className="text-gray-500">Playing often enough. Solid.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-yellow-600 w-20">Rusty</span>
              <span className="text-gray-500">Been a while. May adjust faster.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-orange-500 w-20">Returning</span>
              <span className="text-gray-500">Away a while. Adjusts faster.</span>
            </div>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            If you were a 1350 when you stopped and come back two months later,
            you&apos;re still a 1350. The system just becomes less certain, so it
            adjusts faster &mdash; up or down &mdash; based on how you actually
            play when you return.
          </p>
        </section>

        {/* Doubles */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">How doubles work</h2>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>Uses team average rating</li>
            <li>Reduces swings when partners are uneven</li>
            <li>Gets more accurate with rotation over time</li>
          </ul>
        </section>

        {/* What this is */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">What this is (and isn&apos;t)</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            RDR is built for your regular group. It&apos;s not a universal rating
            like DUPR &mdash; it&apos;s a home court rating that tells you exactly
            where everyone stands among the people you actually play with.
          </p>
        </section>

        {/* CTA */}
        <div className="pt-2 space-y-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 pt-2">
            Built for real games with real people &mdash; not theoretical rankings.
          </p>
          <Link
            href="/help#rdr"
            className="text-sm text-green-700 font-medium hover:text-green-800 transition-colors"
          >
            Full help guide →
          </Link>
        </div>
      </div>
    </div>
  );
}
