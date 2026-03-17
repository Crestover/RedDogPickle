/**
 * Shared app-wide constants.
 *
 * These are sport-AGNOSTIC timing/display constants.
 * Sport-specific constants (target presets, team sizes, etc.)
 * live exclusively in SportConfig (src/lib/sports/).
 */

/** Stale session threshold: 24 hours with no games. */
export const STALE_SESSION_MS = 24 * 60 * 60 * 1000;

/** Duration to show undo confirmation message (ms). */
export const UNDO_CONFIRMATION_DISPLAY_MS = 2000;

/** Debounced router.refresh() delay after mutations (ms). */
export const DEBOUNCED_REFRESH_MS = 1000;
