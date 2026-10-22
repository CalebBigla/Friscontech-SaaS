-- Migration: Reconcile users table for Supabase Auth integration
-- Created: 2026-01-18
-- Description: Split `name` into first_name/last_name, add phone/joined_at/deactivated_at,
--              make role nullable (assigned at approval), extend status enum, and add the
--              handle_new_user trigger that auto-creates a profile when a Supabase auth
--              account is created. Handles two bootstrap paths:
--                (a) first owner  -> creates tenant + owner profile (status='active')
--                (b) staff signup -> validates an onboarding invite, creates a pending
--                                    profile linked to the onboarding row
--              All other public signups are rejected (sign-up is closed; staff join by invite).

-- ============================================================================
-- 1. SPLIT `name` INTO first_name / last_name
-- ============================================================================
-- Backfill the new columns from the existing single `name` field, then drop `name`.
-- The DB is pre-launch (no owner can bootstrap yet), so backfill handles any test rows.

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;

UPDATE users
SET first_name = COALESCE(first_name, split_part(name, ' ', 1)),
    last_name  = COALESCE(last_name, CASE
        WHEN position(' ' in name) > 0 THEN substring(name from position(' ' in name) + 1)
        ELSE ''
    END)
WHERE name IS NOT NULL;

ALTER TABLE users ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN last_name SET NOT NULL;

ALTER TABLE users DROP COLUMN IF EXISTS name;

COMMENT ON COLUMN users.first_name IS 'Given name (collected during onboarding)';
COMMENT ON COLUMN users.last_name IS 'Family name (collected during onboarding)';

-- ============================================================================
-- 2. ADD phone, joined_at, deactivated_at
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

COMMENT ON COLUMN users.phone IS 'Phone number (collected during onboarding)';
COMMENT ON COLUMN users.joined_at IS 'When the staff member was activated (approved)';
COMMENT ON COLUMN users.deactivated_at IS 'When the staff member was deactivated';

-- ============================================================================
-- 3. MAKE `role` NULLABLE + EXTEND `status` ENUM
-- ============================================================================
-- role is NULL for a pending onboarding-created profile; set at owner approval.
-- status gains 'rejected' (owner declined the onboarding) and 'suspended' (revoked later).

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ALTER COLUMN role DROP NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IS NULL OR role IN ('owner', 'manager', 'storekeeper', 'sales_rep'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'inactive', 'pending', 'rejected', 'suspended'));

COMMENT ON COLUMN users.role IS 'Business role. NULL until the owner assigns it at approval.';
COMMENT ON COLUMN users.status IS 'active=can access, pending=awaiting approval, rejected=declined, inactive/suspended=deactivated';

-- NOTE: the handle_new_user() trigger function + its trigger on auth.users are created
-- in migration 20260118010000_restructure_onboardings.sql, AFTER the onboardings table
-- has gained token_hash / submitter_email / used_at. Defining the function there avoids
-- referencing not-yet-existing columns here.

-- ============================================================================
-- 5. UPDATE updated_at TRIGGER (already exists; reused as-is)
-- ============================================================================

-- ============================================================================
-- 6. INDEXES for the new columns
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_status_active ON users(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_users_first_name ON users(first_name);
CREATE INDEX IF NOT EXISTS idx_users_last_name ON users(last_name);
