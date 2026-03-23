"use client";

/**
 * PlayerPicker — shared player-selection component
 *
 * Used in two places with one consistent interaction model:
 *   - "start-session": pick attendees before starting a session (min 4)
 *   - "add-to-session": add group players to an already-active session
 *
 * This is a CONTENT component — it renders into whatever layout wrapper the
 * page provides (max-w-sm mx-auto px-4). The sticky CTA sits at the bottom
 * of the nearest scroll container so it always stays in view without covering
 * content on short lists.
 *
 * Helper text and CTA label are always context-aware and instructive —
 * the user never sees a disabled button without an explanation.
 */

import { useState, useMemo } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlayerPickerMode = "start-session" | "add-to-session";

export interface PlayerOption {
  id: string;
  name: string;
  /** Short code shown in monospace below the name (player.code in our DB) */
  initials: string;
}

interface Props {
  mode: PlayerPickerMode;
  players: PlayerOption[];
  initiallySelectedIds?: string[];
  minRequired?: number;
  title?: string;
  subtitle?: string;
  /** Href for the "+ Add New Player" button */
  addNewHref: string;
  /** Href for the back link; omit to hide the back link */
  onCancelHref?: string;
  /** Text shown after the ← arrow in the back link */
  backLabel?: string;
  /** Called with the selected player IDs when the user confirms */
  onSubmit: (selectedIds: string[]) => Promise<void> | void;
  /** Shown when players array is empty (no players exist at all) */
  emptyStateTitle?: string;
  emptyStateBody?: string;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function getHelperText(
  mode: PlayerPickerMode,
  selectedCount: number,
  minRequired: number
): string {
  if (mode === "start-session") {
    if (selectedCount < minRequired)
      return `${selectedCount} selected \u2014 need at least ${minRequired}`;
    return `${selectedCount} selected`;
  }
  // add-to-session: session is already live, no minimum required messaging
  return `${selectedCount} selected`;
}

function getCtaLabel(
  mode: PlayerPickerMode,
  selectedCount: number,
  minRequired: number,
  isSubmitting: boolean
): string {
  if (isSubmitting)
    return mode === "add-to-session" ? "Adding\u2026" : "Starting\u2026";
  if (mode === "start-session") {
    return selectedCount >= minRequired
      ? "Start session"
      : `Select at least ${minRequired} players`;
  }
  if (selectedCount === 0) return "Select players";
  if (selectedCount === 1) return "Add 1 player";
  return `Add ${selectedCount} players`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlayerPicker({
  mode,
  players,
  initiallySelectedIds = [],
  minRequired = 4,
  title,
  subtitle,
  addNewHref,
  onCancelHref,
  backLabel = "Back",
  onSubmit,
  emptyStateTitle,
  emptyStateBody,
}: Props) {
  const [query, setQuery] = useState("");
  // Always start with no selection; initiallySelectedIds is available for
  // callers that genuinely need pre-selection (e.g. edit flows).
  const [selectedIds, setSelectedIds] = useState<string[]>(
    () => initiallySelectedIds
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ── Filtering ───────────────────────────────────────────────────────────────
  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.initials.toLowerCase().includes(q)
    );
  }, [players, query]);

  // ── Selection ───────────────────────────────────────────────────────────────
  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    if (error) setError("");
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  const isSubmitDisabled =
    mode === "start-session"
      ? selectedIds.length < minRequired
      : selectedIds.length === 0;

  async function handleSubmit() {
    if (isSubmitDisabled || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      await onSubmit(selectedIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      // Runs when onSubmit returns normally (e.g. modal case).
      // For redirect flows the component unmounts before this — fine.
      setIsSubmitting(false);
    }
  }

  const helperText = getHelperText(mode, selectedIds.length, minRequired);
  const ctaLabel = getCtaLabel(mode, selectedIds.length, minRequired, isSubmitting);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">

      {/* Scrollable content */}
      <div className="flex-1 pb-24">

        {/* Back link */}
        {onCancelHref && (
          <Link
            href={onCancelHref}
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6"
          >
            &larr; {backLabel}
          </Link>
        )}

        {/* Title + subtitle */}
        {(title || subtitle) && (
          <div className="mb-5">
            {title && (
              <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="mt-2 text-base text-gray-500">{subtitle}</p>
            )}
          </div>
        )}

        {/* Add New Player */}
        <Link
          href={addNewHref}
          className="flex h-14 w-full items-center justify-center rounded-xl border border-gray-300 bg-white text-base font-medium text-gray-900 hover:bg-gray-50 active:bg-gray-100 transition-colors"
        >
          + Add New Player
        </Link>

        {/* Search */}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players…"
          className="mt-4 block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        {/* Helper text (selection count) */}
        <p className="mt-3 text-sm text-gray-500">{helperText}</p>

        {/* Player list or empty state */}
        {players.length === 0 ? (
          <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-900">
              {emptyStateTitle ?? "No players yet"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {emptyStateBody ?? "Add a new player using the button above."}
            </p>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <p className="mt-3 text-center text-sm text-gray-400 py-6">
            No players match &ldquo;{query}&rdquo;
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {filteredPlayers.map((player) => {
              const isSelected = selectedIds.includes(player.id);
              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => toggleSelected(player.id)}
                  disabled={isSubmitting}
                  className={`flex w-full items-center gap-4 rounded-xl px-4 py-4 text-left transition-colors min-h-[64px] disabled:opacity-50 ${
                    isSelected
                      ? "bg-green-600 text-white shadow-sm"
                      : "bg-white border border-gray-200 text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {/* Circle — border-current auto-adapts: white ring on green, gray ring on white */}
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-current text-sm font-bold">
                    {isSelected ? "✓" : ""}
                  </span>
                  {/* Name + code */}
                  <span className="flex-1">
                    <span className="block font-semibold leading-tight">
                      {player.name}
                    </span>
                    <span className="block text-xs opacity-70 font-mono mt-0.5">
                      {player.initials}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Error */}
        {error && (
          <p
            className="mt-4 text-sm text-red-600 font-medium rounded-xl bg-red-50 px-3 py-2"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>

      {/* Sticky CTA footer — sits below list; sticks to viewport bottom on scroll */}
      <div className="sticky bottom-0 border-t border-gray-200 bg-white pt-4 pb-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitDisabled || isSubmitting}
          className="flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-5 text-lg font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors min-h-[64px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
