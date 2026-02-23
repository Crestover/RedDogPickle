"use server";

import { getServerClient } from "@/lib/supabase/server";
import { RPC } from "@/lib/supabase/rpc";
import type { RpcResult } from "@/lib/types";
import type { PairCountEntry, GameRecord } from "@/lib/autoSuggest";
import { suggestForCourts } from "@/lib/autoSuggest";

/**
 * Courts Mode V2 — Server Actions
 *
 * All actions return RpcResult. None redirect.
 * Client calls router.refresh() after mutations.
 *
 * Every action passes joinCode to the RPC for group-scoped access control.
 */

// ── Helpers ──────────────────────────────────────────────────

function rpcError<T = unknown>(message: string): RpcResult<T> {
  return { ok: false, error: { code: "RPC_ERROR", message } };
}

// ── Actions ──────────────────────────────────────────────────

/** Initialize courts for a session. */
export async function initCourtsAction(
  sessionId: string,
  joinCode: string,
  courtCount: number
): Promise<RpcResult> {
  const supabase = getServerClient();
  const { data, error } = await supabase.rpc(RPC.INIT_COURTS, {
    p_session_id: sessionId,
    p_join_code: joinCode,
    p_court_count: courtCount,
  });
  if (error) return rpcError(error.message);
  return data as RpcResult;
}

/** Suggest and assign courts. Hybrid: fetches data → runs autoSuggest in TS → persists via RPC. */
export async function suggestCourtsAction(
  sessionId: string,
  joinCode: string,
  courtNumbers?: number[]
): Promise<RpcResult> {
  const supabase = getServerClient();

  // Fetch court data to determine which courts are OPEN
  const { data: courts, error: courtsErr } = await supabase
    .from("session_courts")
    .select("court_number, status, team_a_ids, team_b_ids")
    .eq("session_id", sessionId)
    .order("court_number", { ascending: true });

  if (courtsErr) return rpcError(courtsErr.message);

  // Determine which courts to fill
  const allCourts = courts ?? [];
  const openCourts = allCourts.filter(
    (c) => (c as { status: string }).status === "OPEN"
  );

  const targetCourts = courtNumbers
    ? openCourts.filter((c) =>
        courtNumbers.includes((c as { court_number: number }).court_number)
      )
    : openCourts;

  if (targetCourts.length === 0) {
    return { ok: false, error: { code: "NO_OPEN_COURTS", message: "No open courts to fill" } };
  }

  const targetCourtNumbers = targetCourts.map(
    (c) => (c as { court_number: number }).court_number
  );

  // Fetch active players not on IN_PROGRESS courts
  const { data: attendeesRaw } = await supabase
    .from("session_players")
    .select("player_id, status")
    .eq("session_id", sessionId)
    .eq("status", "ACTIVE");

  const activePlayerIds = (attendeesRaw ?? []).map(
    (a) => (a as { player_id: string }).player_id
  );

  // Exclude players already on IN_PROGRESS courts
  const inProgressCourts = allCourts.filter(
    (c) => (c as { status: string }).status === "IN_PROGRESS"
  );
  const playersOnInProgress = new Set<string>();
  for (const c of inProgressCourts) {
    const tA = (c as { team_a_ids?: string[] | null }).team_a_ids;
    const tB = (c as { team_b_ids?: string[] | null }).team_b_ids;
    if (tA) for (const id of tA) if (id) playersOnInProgress.add(id);
    if (tB) for (const id of tB) if (id) playersOnInProgress.add(id);
  }

  const availablePlayers = activePlayerIds.filter(
    (id) => !playersOnInProgress.has(id)
  );

  // Fetch games (non-voided) for algorithm
  const { data: gamesRaw } = await supabase
    .from("games")
    .select("id, team_a_score, team_b_score, played_at, voided_at, game_players(player_id, team)")
    .eq("session_id", sessionId)
    .is("voided_at", null)
    .order("played_at", { ascending: true });

  const games: GameRecord[] = (gamesRaw ?? []).map((g) => {
    const gps = Array.isArray(
      (g as { game_players?: unknown }).game_players
    )
      ? (g as { game_players: { player_id: string; team: string }[] }).game_players
      : [];
    return {
      id: (g as { id: string }).id,
      teamAIds: gps
        .filter((gp) => gp.team === "A")
        .map((gp) => gp.player_id),
      teamBIds: gps
        .filter((gp) => gp.team === "B")
        .map((gp) => gp.player_id),
      played_at: (g as { played_at: string }).played_at,
    };
  });

  // Fetch pair counts
  const { data: pairCountsRaw } = await supabase.rpc(
    RPC.GET_SESSION_PAIR_COUNTS,
    { p_session_id: sessionId }
  );

  const pairCounts: PairCountEntry[] = (
    (pairCountsRaw ?? []) as {
      player_a_id: string;
      player_b_id: string;
      games_together: number;
    }[]
  ).map((p) => ({
    player_a_id: p.player_a_id,
    player_b_id: p.player_b_id,
    games_together: p.games_together,
  }));

  // Run algorithm
  const assignments = suggestForCourts(
    games,
    availablePlayers,
    targetCourtNumbers,
    pairCounts
  );

  if (assignments.length === 0) {
    return {
      ok: false,
      error: { code: "NOT_ENOUGH_PLAYERS", message: "Not enough available players to fill courts" },
    };
  }

  // Persist via assign_courts RPC
  const payload = assignments.map((a) => ({
    court_number: a.courtNumber,
    team_a_ids: a.teamA,
    team_b_ids: a.teamB,
  }));

  const { data, error } = await supabase.rpc(RPC.ASSIGN_COURTS, {
    p_session_id: sessionId,
    p_join_code: joinCode,
    p_assignments: payload,
  });

  if (error) return rpcError(error.message);
  return data as RpcResult;
}

/** Explicit OPEN -> IN_PROGRESS transition for a manually filled court. */
export async function startCourtGameAction(
  sessionId: string,
  joinCode: string,
  courtNumber: number
): Promise<RpcResult> {
  const supabase = getServerClient();
  const { data, error } = await supabase.rpc(RPC.START_COURT_GAME, {
    p_session_id: sessionId,
    p_join_code: joinCode,
    p_court_number: courtNumber,
  });
  if (error) return rpcError(error.message);
  return data as RpcResult;
}

/** Record a game from an IN_PROGRESS court. Resets court to OPEN. Fire-and-forget Elo. */
export async function recordCourtGameAction(
  sessionId: string,
  joinCode: string,
  courtNumber: number,
  teamAScore: number,
  teamBScore: number,
  force = false
): Promise<RpcResult<{ game_id: string }>> {
  // Pre-flight score validation (also enforced in record_game RPC)
  const winner = Math.max(teamAScore, teamBScore);
  const loser = Math.min(teamAScore, teamBScore);

  if (teamAScore === teamBScore) {
    return { ok: false, error: { code: "INVALID_SCORE", message: "Scores cannot be equal." } };
  }
  if (winner < 11) {
    return {
      ok: false,
      error: { code: "INVALID_SCORE", message: `Winning score must be at least 11 (got ${winner}).` },
    };
  }
  if (winner - loser < 2) {
    return {
      ok: false,
      error: {
        code: "INVALID_SCORE",
        message: `Winning margin must be at least 2 (got ${winner - loser}).`,
      },
    };
  }

  const supabase = getServerClient();
  const { data, error } = await supabase.rpc(RPC.RECORD_COURT_GAME, {
    p_session_id: sessionId,
    p_join_code: joinCode,
    p_court_number: courtNumber,
    p_team_a_score: teamAScore,
    p_team_b_score: teamBScore,
    p_force: force,
  });

  if (error) return rpcError(error.message);

  const result = data as RpcResult<{ game_id: string }>;

  // Fire-and-forget: apply Elo ratings
  if (result.ok && result.data?.game_id) {
    void Promise.resolve(
      supabase.rpc(RPC.APPLY_RATINGS_FOR_GAME, { p_game_id: result.data.game_id })
    )
      .then(({ error: eloErr }) => {
        if (eloErr) console.error("[recordCourtGameAction] Elo RPC failed (non-blocking):", eloErr);
      })
      .catch((err) =>
        console.error("[recordCourtGameAction] Elo RPC failed (non-blocking):", err)
      );
  }

  return result;
}

/** Assign a single player to a slot on an OPEN court. */
export async function assignCourtSlotAction(
  sessionId: string,
  joinCode: string,
  courtNumber: number,
  team: "A" | "B",
  slot: number,
  playerId: string
): Promise<RpcResult> {
  const supabase = getServerClient();
  const { data, error } = await supabase.rpc(RPC.UPDATE_COURT_ASSIGNMENT, {
    p_session_id: sessionId,
    p_join_code: joinCode,
    p_court_number: courtNumber,
    p_team: team,
    p_slot: slot,
    p_player_id: playerId,
  });
  if (error) return rpcError(error.message);
  return data as RpcResult;
}

/** Clear one slot on an OPEN court. */
export async function clearCourtSlotAction(
  sessionId: string,
  joinCode: string,
  courtNumber: number,
  team: "A" | "B",
  slot: number
): Promise<RpcResult> {
  const supabase = getServerClient();
  const { data, error } = await supabase.rpc(RPC.CLEAR_COURT_SLOT, {
    p_session_id: sessionId,
    p_join_code: joinCode,
    p_court_number: courtNumber,
    p_team: team,
    p_slot: slot,
  });
  if (error) return rpcError(error.message);
  return data as RpcResult;
}

/** Mark a player as out (immediate or after_game). */
export async function markPlayerOutAction(
  sessionId: string,
  joinCode: string,
  playerId: string,
  mode: "immediate" | "after_game"
): Promise<RpcResult> {
  const supabase = getServerClient();
  const { data, error } = await supabase.rpc(RPC.MARK_PLAYER_OUT, {
    p_session_id: sessionId,
    p_join_code: joinCode,
    p_player_id: playerId,
    p_mode: mode,
  });
  if (error) return rpcError(error.message);
  return data as RpcResult;
}

/** Restore an inactive player to active. */
export async function makePlayerActiveAction(
  sessionId: string,
  joinCode: string,
  playerId: string
): Promise<RpcResult> {
  const supabase = getServerClient();
  const { data, error } = await supabase.rpc(RPC.MAKE_PLAYER_ACTIVE, {
    p_session_id: sessionId,
    p_join_code: joinCode,
    p_player_id: playerId,
  });
  if (error) return rpcError(error.message);
  return data as RpcResult;
}

/** Update court count (add/remove empty courts). */
export async function updateCourtCountAction(
  sessionId: string,
  joinCode: string,
  courtCount: number
): Promise<RpcResult> {
  const supabase = getServerClient();
  const { data, error } = await supabase.rpc(RPC.UPDATE_COURT_COUNT, {
    p_session_id: sessionId,
    p_join_code: joinCode,
    p_court_count: courtCount,
  });
  if (error) return rpcError(error.message);
  return data as RpcResult;
}
