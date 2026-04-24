-- Stage 9.4b: Add scope checklist (per-assignment day-of-work items)
-- and a field notes text area for the chief to communicate back to the PM.

ALTER TABLE stakeout_assignments
  ADD COLUMN scope_checklist jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN chief_field_notes text;

COMMENT ON COLUMN stakeout_assignments.scope_checklist IS
  'Day-of-work checklist for the chief. Array of {id, label, done}. PM creates items; chief ticks done.';

COMMENT ON COLUMN stakeout_assignments.chief_field_notes IS
  'Free-text notes from the chief back to the PM (e.g., "Monument 99 not found, assumed destroyed"). Distinct from the PM notes field.';
