-- ============================================================================
-- M11.0 — View-Only Access Codes
--
-- Adds a view_code column to groups for read-only sharing.
-- Creates ensure_view_code() RPC to lazily generate view codes.
-- ============================================================================

-- ── Schema changes ──────────────────────────────────────────────────────────

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS view_code text,
  ADD COLUMN IF NOT EXISTS view_code_created_at timestamptz;

-- Unique index (NULLs allowed — only non-null values are checked)
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_view_code
  ON public.groups (view_code);

-- Format constraint: lowercase alphanumeric + hyphens only (idempotent)
DO $$
BEGIN
  ALTER TABLE public.groups
    ADD CONSTRAINT groups_view_code_format
    CHECK (view_code IS NULL OR view_code ~ '^[a-z0-9\-]+$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- ── ensure_view_code RPC ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ensure_view_code(p_join_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code        text;
  v_group_id    uuid;
  v_existing    text;
  v_candidate   text;
  v_attempts    int := 0;
  v_max         int := 5;
BEGIN
  -- Normalize input — never trust caller casing
  v_code := lower(p_join_code);

  -- Resolve group
  SELECT id, view_code
    INTO v_group_id, v_existing
    FROM public.groups
   WHERE join_code = v_code;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Group not found for join_code: %', v_code;
  END IF;

  -- Already set → return immediately
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Generate candidate: {join_code}-view
  v_candidate := v_code || '-view';

  LOOP
    v_attempts := v_attempts + 1;

    -- Check uniqueness
    IF NOT EXISTS (
      SELECT 1 FROM public.groups WHERE view_code = v_candidate
    ) THEN
      -- Persist
      UPDATE public.groups
         SET view_code            = v_candidate,
             view_code_created_at = now()
       WHERE id = v_group_id;

      RETURN v_candidate;
    END IF;

    -- Collision — append random suffix
    IF v_attempts >= v_max THEN
      RAISE EXCEPTION 'Failed to generate unique view_code after % attempts', v_max;
    END IF;

    v_candidate := v_code || '-view-' || substr(md5(random()::text), 1, 4);
  END LOOP;
END;
$$;

-- Grant to both roles (anon for SSR, authenticated for future use)
GRANT EXECUTE ON FUNCTION public.ensure_view_code(text) TO anon;
GRANT EXECUTE ON FUNCTION public.ensure_view_code(text) TO authenticated;
