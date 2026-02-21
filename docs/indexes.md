# Expected Database Indexes

Indexes that should exist in the Supabase project for query performance.
Applied via `supabase/migrations/m5.3_indexes.sql` (idempotent).

## Foreign-Key Lookup Indexes

| Index Name | Table | Column(s) | Rationale |
|---|---|---|---|
| `idx_games_session_id` | `games` | `session_id` | Session page fetches all games for a session |
| `idx_sessions_group_id` | `sessions` | `group_id` | Dashboard + history filter sessions by group |
| `idx_game_players_game_id` | `game_players` | `game_id` | Game card joins game_players for each game |
| `idx_session_players_session_id` | `session_players` | `session_id` | Session page fetches attendees by session |

## Notes

- Supabase auto-creates indexes on primary keys but **not** on foreign-key columns.
- All four indexes are `CREATE INDEX IF NOT EXISTS` — safe to re-run.
- Unique constraints (e.g. `players_group_code_unique`) already act as indexes for those columns.
