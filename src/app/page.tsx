"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

/** Random rotation — one slogan per page load. First entry is the default
 *  shown during server render / before hydration picks a random one. */
const SLOGANS = [
  "A proper record for a plastic ball.",
  "Definitive Proof of Who Owns the Kitchen.",
  "All the Drama of Wimbledon. None of the Tennis.",
  "Because Every Underhand Serve Deserves a Legacy.",
  "Dink Responsibly. Record Accurately.",
  "Big Ego. Little Ball. Real Stats.",
  "Certified Standings for Perforated Plastics.",
  "Grand Slam Data for a Hollow Ball.",
  "Proper Records for the Underdogs.",
  "The Leaderboard with a Bite.",
  "Because Every Stray Dink Deserves a Legacy.",
  "Big Bark. Small Ball. Real Stats.",
  "Bite-Sized Drama. Professional Data.",
  "Marking Your Territory, One Dink at a Time.",
  "Good Records for Good Boys (and Girls).",
  "No Scraps. Just Stats.",
  "Tracking the Pack. Ranking the Alphas.",
  "Real Brackets. No Bark, All Bite.",
];

export default function HomePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [slogan, setSlogan] = useState(SLOGANS[0]);

  // Client-only random pick — avoids a server/client hydration mismatch,
  // since the server can't know which random slogan the client would pick.
  useEffect(() => {
    setSlogan(SLOGANS[Math.floor(Math.random() * SLOGANS.length)]);
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toLowerCase();
    if (!trimmed) {
      setError("Please enter a group code.");
      return;
    }
    setError("");
    router.push(`/g/${trimmed}`);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo / tagline */}
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <Image
              src="/PlayRedDog_Logo_Transparent_623px.png"
              alt="Red Dog"
              width={623}
              height={623}
              sizes="160px"
              className="w-[160px] h-auto"
              priority
            />
          </div>
          <h1 className="text-xl font-medium text-gray-900 tracking-wide mb-2">
            {slogan}
          </h1>
          <p className="text-gray-500 mb-8">
            Enter your group code to get started.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="group-code"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Group Code
            </label>
            <input
              id="group-code"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. red-dogs"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError("");
              }}
              className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-lg shadow-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {error && (
              <p className="mt-2 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-4 text-lg font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors min-h-[56px]"
          >
            Go to Group →
          </button>
        </form>
      </div>
    </div>
  );
}
