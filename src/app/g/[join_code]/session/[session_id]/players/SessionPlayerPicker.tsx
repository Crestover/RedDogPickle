"use client";

/**
 * SessionPlayerPicker — wrapper around PlayerPicker for "add to active session".
 *
 * Responsible for:
 *   - Providing the onSubmit callback (addPlayersToSessionAction + navigate back)
 *   - Passing ?added= IDs in the return URL so RecordGameForm can auto-select them
 *
 * All player-selection UI is delegated to PlayerPicker.
 */

import { useRouter } from "next/navigation";
import { addPlayersToSessionAction } from "@/app/actions/sessions";
import PlayerPicker, { type PlayerOption } from "@/lib/components/PlayerPicker";

interface Props {
  sessionId: string;
  joinCode: string;
  /** Group players not yet attending this session, sorted by recency */
  availablePlayers: PlayerOption[];
  newPlayerUrl: string;
  /** How many more players are needed on the Quick Game screen for a full game */
  slotsNeeded?: number;
}

export default function SessionPlayerPicker({
  sessionId,
  joinCode,
  availablePlayers,
  newPlayerUrl,
  slotsNeeded = 0,
}: Props) {
  const router = useRouter();
  const sessionUrl = `/g/${joinCode}/session/${sessionId}`;

  async function handleAddPlayers(selectedIds: string[]) {
    const result = await addPlayersToSessionAction(
      "full",
      sessionId,
      joinCode,
      selectedIds
    );
    if ("error" in result) throw new Error(result.error);
    // Return to Quick Game with ?added= so RecordGameForm auto-selects + highlights
    router.push(`${sessionUrl}?added=${selectedIds.join(",")}`);
  }

  const subtitle =
    slotsNeeded > 0
      ? `Select players to add. You need ${slotsNeeded} more for a full game.`
      : "Select players to add to this session.";

  return (
    <PlayerPicker
      mode="add-to-session"
      players={availablePlayers}
      minRequired={4}
      title="Add players"
      subtitle={subtitle}
      addNewHref={newPlayerUrl}
      onCancelHref={sessionUrl}
      backLabel="Back to session"
      onSubmit={handleAddPlayers}
      emptyStateTitle="Everyone is already in this session"
      emptyStateBody="You can add a new player if someone else joins."
    />
  );
}
