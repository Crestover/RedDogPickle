-- m13.0: Add sport column to groups
--
-- Supports multi-sport expansion. Default is 'pickleball' so all existing
-- groups are automatically assigned the correct sport.

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'pickleball';

ALTER TABLE public.groups
  ADD CONSTRAINT groups_sport_check CHECK (sport IN ('pickleball', 'padel'));
