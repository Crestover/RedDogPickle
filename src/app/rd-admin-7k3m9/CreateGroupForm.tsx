"use client";

import { useState, useTransition } from "react";
import { createGroupAction } from "@/app/actions/admin";
import type { Sport } from "@/lib/types";

/** Slugify a group name into a join-code suggestion: lowercase, hyphenated, alnum only. */
function suggestJoinCode(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function CreateGroupForm() {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [sport, setSport] = useState<Sport>("pickleball");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleNameChange(val: string) {
    setName(val);
    if (error) setError("");
    if (!codeTouched) {
      setJoinCode(suggestJoinCode(val));
    }
  }

  function handleCodeChange(val: string) {
    setCodeTouched(true);
    setJoinCode(val.toLowerCase().replace(/[^a-z0-9-]/g, ""));
    if (error) setError("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Group name is required.");
      return;
    }
    if (!joinCode.trim()) {
      setError("Join code is required.");
      return;
    }
    startTransition(async () => {
      const result = await createGroupAction(name, joinCode, sport);
      if (result?.error) {
        setError(result.error);
      }
      // On success the action redirects — no client handling needed.
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="new-group-name" className="block text-sm font-medium text-gray-700 mb-1">
          Group name
        </label>
        <input
          id="new-group-name"
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          disabled={isPending}
          className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
        />
      </div>

      <div>
        <label htmlFor="new-group-code" className="block text-sm font-medium text-gray-700 mb-1">
          Join code
          <span className="ml-2 text-xs font-normal text-gray-400">(auto-suggested — lowercase, hyphens ok)</span>
        </label>
        <input
          id="new-group-code"
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={joinCode}
          onChange={(e) => handleCodeChange(e.target.value)}
          disabled={isPending}
          className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base font-mono placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
        />
      </div>

      <div>
        <span className="block text-sm font-medium text-gray-700 mb-1">Sport</span>
        <div className="flex gap-2">
          {(["pickleball", "padel"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSport(option)}
              disabled={isPending}
              className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize transition-colors ${
                sport === option
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              } disabled:opacity-50`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors disabled:opacity-50"
      >
        {isPending ? "Creating…" : "Create group"}
      </button>
    </form>
  );
}
