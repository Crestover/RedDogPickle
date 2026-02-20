"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

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
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo / title */}
        <div className="text-center">
          <div className="text-5xl mb-3">🏓</div>
          <h1 className="text-3xl font-bold tracking-tight">RedDog Pickle</h1>
          <p className="mt-2 text-gray-500 text-sm">
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
    </main>
  );
}
