/**
 * Date/time formatting helpers pinned to America/Chicago (Dallas).
 *
 * All time formatting in the app must route through this file.
 * Do not call toLocaleString / toLocaleDateString / toLocaleTimeString
 * directly elsewhere.
 *
 * Uses Intl.DateTimeFormat with an explicit timeZone so output is
 * consistent on both Vercel servers (UTC) and user browsers (any tz).
 */

export const APP_TIME_ZONE = "America/Chicago";

// ── Helpers ────────────────────────────────────────────────────────────────

function toSafeDate(iso: string | Date | null | undefined): Date | null {
  if (iso == null) return null;
  try {
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Format a timestamp as time only, e.g. "7:41 PM".
 * Returns "" for null / undefined / invalid input.
 */
export function formatTime(
  iso: string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = toSafeDate(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
    ...opts,
  }).format(d);
}

/**
 * Format a timestamp as date only, e.g. "Feb 24, 2026".
 * Returns "" for null / undefined / invalid input.
 */
export function formatDate(
  iso: string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = toSafeDate(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: APP_TIME_ZONE,
    ...opts,
  }).format(d);
}

/**
 * Format a timestamp as date + time, e.g. "Feb 24, 2026, 7:41 PM".
 * Returns "" for null / undefined / invalid input.
 */
export function formatDateTime(
  iso: string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = toSafeDate(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
    ...opts,
  }).format(d);
}

/**
 * Format a plain "YYYY-MM-DD" date string (not a timestamptz).
 *
 * new Date("2026-02-24") is interpreted as UTC midnight. Formatting that
 * with America/Chicago (UTC-6) would render as February 23. We avoid this
 * by constructing the Date from year/month/day at noon local time.
 */
export function formatDateString(
  dateStr: string | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!dateStr) return "";
  try {
    const [year, month, day] = dateStr.split("-");
    const d = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      ...opts,
    }).format(d);
  } catch {
    return "";
  }
}
