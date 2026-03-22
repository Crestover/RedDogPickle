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
}

export default function SessionPlayerPicker({
  sessionId,
  joinCode,
  availablePlayers,
  newPlayerUrl,
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

  return (
    <PlayerPicker
      mode="add-to-session"
      players={availablePlayers}
      minRequired={4}
      title="Add players"
      subtitle="Select from your group or add a new player"
      addNewHref={newPlayerUrl}
      onCancelHref={sessionUrl}
      backLabel="Back to session"
      onSubmit={handleAddPlayers}
      emptyStateTitle="Everyone is already in this session"
      emptyStateBody="You can add a new player if someone else joins."
    />
  );
}
