/**
 * Access mode types + guard for write actions.
 *
 * Every write-capable server action accepts `mode: AccessMode` as its
 * first parameter and calls `requireFullAccess(mode)` at the top.
 *
 * /v/ pages never import or call write actions, but this guard is a
 * defense-in-depth safety net against future regressions if a write
 * component is accidentally reused in /v/.
 */

export type AccessMode = "full" | "view";

export function requireFullAccess(mode: AccessMode): void {
  if (mode !== "full") {
    throw new Error("Read-only access. Writes are not permitted.");
  }
}
