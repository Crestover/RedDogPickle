import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help — Red Dog",
};

export default function HelpPage() {
  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-8">
        {/* Back link */}
        <Link
          href="/"
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          &larr; Home
        </Link>

        {/* Title */}
        <div className="flex flex-col items-center text-center">
          <Image
            src="/PlayRedDog_Logo_Transparent_MarkOnly.png"
            alt="Red Dog mark"
            width={32}
            height={32}
            className="opacity-90 mb-3"
            priority
          />
          <h1 className="text-2xl font-bold">How Red Dog Works</h1>
        </div>

        {/* The Idea */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">The Idea</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Red Dog is a fast, mobile-first score tracker built for doubles
            pickleball. It&apos;s made for real court sessions &mdash; record
            games in seconds, see who&apos;s hot, and track stats over time.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            No logins. No passwords. No drama.
          </p>
        </section>

        {/* Sessions */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">Sessions</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Each meetup is a <strong>session</strong>. A session:
          </p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>Tracks who attended</li>
            <li>Records games in order</li>
            <li>Generates standings automatically</li>
            <li>Uses the scoring rules you choose (11 / 15 / 21, win by 1 or 2)</li>
          </ul>
          <p className="text-sm text-gray-600 leading-relaxed">
            Sessions stay active until you end them manually. No
            auto-expiration.
          </p>
        </section>

        {/* Recording Games */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">
            Recording Games
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Recording a game takes three steps:
          </p>
          <ol className="text-sm text-gray-600 space-y-1 list-decimal pl-5">
            <li>Pick four players</li>
            <li>Assign teams</li>
            <li>Enter the score</li>
          </ol>
          <p className="text-sm text-gray-600 leading-relaxed">
            Duplicate protection helps prevent accidental double entries across
            devices. Games are <strong>locked in</strong> once recorded. If
            something was entered incorrectly, you can void the most recent
            game.
          </p>
        </section>

        {/* Manual vs Courts */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">
            Manual vs Courts
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Red Dog has two ways to run a session. Pick what matches your vibe.
          </p>

          <h3 className="text-sm font-semibold text-gray-900 pt-1">
            Manual Mode
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            Use this when you want full control.
          </p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>Select the four players</li>
            <li>Set the teams</li>
            <li>Enter the score</li>
          </ul>
          <p className="text-sm text-gray-600 leading-relaxed">
            Best for one court, casual games, or when you&apos;re keeping it
            simple.
          </p>

          <h3 className="text-sm font-semibold text-gray-900 pt-1">
            Courts Mode
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            Use this when you&apos;re managing multiple courts and rotating
            people in.
          </p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>Set your number of courts</li>
            <li>Fill courts faster (with smart suggestions if you want)</li>
            <li>Keep the rotation moving across courts</li>
          </ul>
          <p className="text-sm text-gray-600 leading-relaxed">
            Best for bigger groups, multiple courts, and &ldquo;next four
            up&rdquo; nights.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            You can switch between Manual and Courts anytime during a session.
          </p>
        </section>

        {/* Leaderboards */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">
            Leaderboards
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            There are three leaderboard views:
          </p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>All-Time</li>
            <li>Last 30 Days</li>
            <li>Last Session</li>
          </ul>
          <p className="text-sm text-gray-600 leading-relaxed mt-2">
            Stats include:
          </p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>Games played</li>
            <li>Wins</li>
            <li>Win percentage</li>
            <li>Points for / against</li>
            <li>Point differential</li>
            <li>Average point differential</li>
            <li><strong>RDR rating</strong></li>
          </ul>
          <p className="text-sm text-gray-600 leading-relaxed mt-2">
            Clean. Simple. Always up to date.
          </p>
        </section>

        {/* RDR */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">
            RDR &mdash; Red Dog Rating
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            RDR is a modern rating system built specifically for doubles
            pickleball. Everyone starts at <strong>1200</strong>. After each
            game, winners go up and losers go down &mdash; how much depends on
            the matchup.
          </p>

          <h3 className="text-sm font-semibold text-gray-900 pt-1">
            What affects the rating?
          </h3>

          <p className="text-sm text-gray-600 leading-relaxed">
            <strong>Who you beat</strong><br />
            Beat stronger opponents &rarr; bigger boost. Lose to weaker
            opponents &rarr; bigger drop.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            <strong>How you won (with limits)</strong><br />
            Winning by a solid margin matters. But blowouts don&apos;t let
            ratings run wild.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            <strong>Doubles balance</strong><br />
            If a very strong player teams with a much weaker partner, rating
            swings are slightly dampened. This keeps mixed-skill games fair.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            <strong>New player ramp</strong><br />
            New players move faster early on. After enough games, ratings
            stabilize.
          </p>
        </section>

        {/* Voids */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">
            Voids &amp; Rating Integrity
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            If the most recent game is voided:
          </p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>The game is marked voided (never deleted)</li>
            <li>The rating changes from that game are reversed automatically</li>
            <li>Leaderboards update immediately</li>
          </ul>
          <p className="text-sm text-gray-600 leading-relaxed">
            Older games can&apos;t be edited or selectively changed.
          </p>
        </section>

        {/* No Accounts? */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">
            No Accounts?
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Correct. Red Dog is trust-based. Anyone with the group link can:
          </p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>Start sessions</li>
            <li>Add players</li>
            <li>Record games</li>
          </ul>
          <p className="text-sm text-gray-600 leading-relaxed">
            It&apos;s built for real-life friend groups &mdash; not tournaments
            or public leagues.
          </p>
        </section>

        {/* FAQ */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900">FAQ</h2>

          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-900">
              Can games be edited?
            </h3>
            <p className="text-sm text-gray-600">
              No. Games are immutable to keep stats clean and prevent disputes.
              If needed, the most recent game can be voided.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-900">
              Can we play to 15 or 21 instead of 11?
            </h3>
            <p className="text-sm text-gray-600">
              Yes. Each session can choose 11, 15, or 21 points &mdash; win by
              1 or win by 2.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-900">
              Can multiple people record games?
            </h3>
            <p className="text-sm text-gray-600">
              Yes. Duplicate detection helps prevent double entries across
              devices.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-900">
              Will ratings change for old games?
            </h3>
            <p className="text-sm text-gray-600">
              No. Ratings apply going forward from when they&apos;re introduced.
              There is no retroactive recalculation.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-900">
              How do I get a group code?
            </h3>
            <p className="text-sm text-gray-600">
              Group codes are shared by someone in your playing group. If you
              don&apos;t have one, ask the person who sent you the link. Red Dog
              is designed for real-life friend groups &mdash; not public signups.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
