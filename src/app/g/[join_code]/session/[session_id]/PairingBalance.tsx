/**
 * Pairing Balance — Server Component.
 *
 * Shows how many times each pair of session attendees has played
 * on the same team. Sorted fewest-first so the group can see
 * which pairs are overdue to play together.
 */

interface PairCount {
  player_a_id: string;
  player_a_name: string;
  player_b_id: string;
  player_b_name: string;
  games_together: number;
}

interface PairingBalanceProps {
  pairs: PairCount[];
}

export default function PairingBalance({ pairs }: PairingBalanceProps) {
  if (pairs.length === 0) return null;

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
        Pairing Balance
      </h2>
      <p className="text-xs text-gray-400 mb-3">
        Fewest games together first
      </p>
      <div className="space-y-1">
        {pairs.map((pair) => (
          <div
            key={`${pair.player_a_id}-${pair.player_b_id}`}
            className="flex items-center justify-between py-1.5 text-sm"
          >
            <span className="text-gray-700">
              {pair.player_a_name}
              <span className="mx-1.5 text-gray-300">·</span>
              {pair.player_b_name}
            </span>
            <span className="text-gray-400 tabular-nums shrink-0 ml-3">
              {pair.games_together} {pair.games_together === 1 ? "game" : "games"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
