import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help — RedDog Pickle",
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
          ← Home
        </Link>

        {/* Title */}
        <div className="text-center">
          <div className="text-4xl mb-2">🏓</div>
          <h1 className="text-2xl font-bold">How RedDog Pickle Works</h1>
        </div>

        {/* The Idea */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">The Idea</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            RedDog Pickle is a fast, mobile-first score tracker for doubles
            pickleball. It&apos;s built for live sessions — record games in
            seconds, see who&apos;s hot, and track stats over time.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            No login. No accounts. Just your group and your games.
          </p>
        </section>

        {/* Sessions */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">Sessions</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Each meetup is a session. A session:
          </p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>Tracks who attended</li>
            <li>Records games in chronological order</li>
            <li>Automatically generates standings</li>
          </ul>
          <p className="text-sm text-gray-600 leading-relaxed">
            Sessions stay active until you end them manually.
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
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>Pick four players</li>
            <li>Assign teams</li>
            <li>Enter the score</li>
          </ul>
          <p className="text-sm text-gray-600 leading-relaxed">
            Duplicate protection prevents accidental double entries across
            devices. Games are immutable once recorded.
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
            <li>Elo rating (after rated games begin)</li>
          </ul>
        </section>

        {/* Elo Ratings */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">Elo Ratings</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Elo is a skill rating system that adjusts after every game.
          </p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>New players start at 1200</li>
            <li>Provisional players adjust faster</li>
            <li>Established players adjust more gradually</li>
          </ul>
          <p className="text-sm text-gray-600 leading-relaxed">
            Ratings update automatically after each new game going forward.
          </p>
        </section>

        {/* No Accounts? */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">
            No Accounts?
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Correct. RedDog Pickle is trust-based. Anyone with the group link
            can:
          </p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>Start sessions</li>
            <li>Add players</li>
            <li>Record games</li>
          </ul>
          <p className="text-sm text-gray-600 leading-relaxed">
            It&apos;s designed for real-life friend groups — not tournaments or
            public leagues.
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
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-900">
              Can we play to 15 instead of 11?
            </h3>
            <p className="text-sm text-gray-600">
              Yes. The app doesn&apos;t lock scoring rules.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-900">
              Can multiple people record games?
            </h3>
            <p className="text-sm text-gray-600">
              Yes. Duplicate detection prevents double entries across devices.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-900">
              Will ratings change for old games?
            </h3>
            <p className="text-sm text-gray-600">
              No. Ratings apply going forward from when they&apos;re introduced.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-900">
              How do I get a group code?
            </h3>
            <p className="text-sm text-gray-600">
              Group codes are shared by someone in your playing group. If you
              don&apos;t have one, ask the person who sent you the link. RedDog
              Pickle is designed for real-life friend groups — not public
              signups.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
