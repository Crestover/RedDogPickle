"use client";

import { useState, useTransition } from "react";
import { addPlayerAction, suggestCode } from "@/app/actions/players";

interface Props {
  groupId: string;
  joinCode: string;
  redirectTo: string;
}

export default function AddPlayerForm({ groupId, joinCode, redirectTo }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [nameError, setNameError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [isPending, startTransition] = useTransition();

  // Auto-suggest code from name, unless user has manually edited it
  function handleNameChange(val: string) {
    setDisplayName(val);
    if (nameError) setNameError("");
    if (!codeTouched) {
      setCode(suggestCode(val));
    }
  }

  function handleCodeChange(val: string) {
    setCodeTouched(true);
    setCode(val.toUpperCase().replace(/[^A-Z0-9]/g, ""));
    if (codeError) setCodeError("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Client-side pre-validation
    if (!displayName.trim()) {
      setNameError("Name is required.");
      return;
    }
    if (!code.trim()) {
      setCodeError("Code is required.");
      return;
    }

    startTransition(async () => {
      const result = await addPlayerAction(
        groupId,
        joinCode,
        displayName,
        code,
        redirectTo
      );
      if (result?.error) {
        if (result.field === "display_name") setNameError(result.error);
        else if (result.field === "code") setCodeError(result.error);
        else setCodeError(result.error); // fallback
      }
      // On success the action redirects — no client handling needed.
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Display Name */}
      <div>
        <label
          htmlFor="display-name"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Full Name
        </label>
        <input
          id="display-name"
          type="text"
          autoCapitalize="words"
          autoComplete="name"
          placeholder="e.g. John Doe"
          value={displayName}
          onChange={(e) => handleNameChange(e.target.value)}
          disabled={isPending}
          className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
        />
        {nameError && (
          <p className="mt-1.5 text-sm text-red-600" role="alert">
            {nameError}
          </p>
        )}
      </div>

      {/* Code */}
      <div>
        <label
          htmlFor="player-code"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Player Code
          <span className="ml-2 text-xs font-normal text-gray-400">
            (3 uppercase letters — auto-suggested)
          </span>
        </label>
        <input
          id="player-code"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. JDO"
          maxLength={6}
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          disabled={isPending}
          className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base font-mono placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
        />
        {codeError && (
          <p className="mt-1.5 text-sm text-red-600" role="alert">
            {codeError}
          </p>
        )}
        {!codeError && code && (
          <p className="mt-1.5 text-xs text-gray-400">
            Must be unique within this group.
          </p>
        )}
      </div>

      {/* Preview */}
      {(displayName.trim() || code) && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-800 font-mono">
            {code || "???"}
          </span>
          <span className="text-sm font-medium text-gray-700">
            {displayName.trim() || "Player name"}
          </span>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-4 text-base font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors min-h-[56px] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Adding player…" : "Add Player"}
      </button>
    </form>
  );
}
