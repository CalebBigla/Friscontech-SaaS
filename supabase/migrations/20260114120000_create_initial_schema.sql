-- Migration: Create Initial Schema (Foundation Tables)
-- Created: 2026-01-14
-- Description: Core tables for tenants, branches, and users

-- ============================================================================
-- TENANTS TABLE
-- ============================================================================
-- Represents the organization/company using the system
-- In this single-tenant deployment, there should be only one tenant record

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  business_email TEXT NOT NULL,
  phone TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN')),
  timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  plan TEXT NOT NULL DEFAULT 'Growth',
  expiry_alert_months INTEGER NOT NULL DEFAULT 6 CHECK (expiry_alert_months >= 1 AND expiry_alert_months <= 12),
  reference_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tenants IS 'Organization/company settings and configuration';
COMMENT ON COLUMN tenants.expiry_alert_months IS 'Months before expiry when stock alerts start appearing';
COMMENT ON COLUMN tenants.reference_date IS 'Business reference date for reporting and demo purposes';

-- ============================================================================
-- BRANCHES TABLE
-- ============================================================================
-- Physical locations/branches of the organization

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  location TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  manager_id UUID, -- References users(id), added after users table
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT branches_tenant_code_unique UNIQUE(tenant_id, code)
);

COMMENT ON TABLE branches IS 'Physical branch locations';
COMMENT ON COLUMN branches.code IS 'Unique branch code within tenant (e.g., IKJ-001)';
COMMENT ON COLUMN branches.manager_id IS 'User who manages this branch';

CREATE INDEX idx_branches_tenant ON branches(tenant_id);
CREATE INDEX idx_branches_manager ON branches(manager_id);
CREATE INDEX idx_branches_status ON branches(status);

-- ============================================================================
-- USERS TABLE (Profiles)
-- ============================================================================
-- User profiles linked to Supabase auth.users
-- Contains business role and tenant membership

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'storekeeper', 'sales_rep')),
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE users IS 'User profiles and business roles';
COMMENT ON COLUMN users.id IS 'Links to auth.users(id) - authentication identity';
COMMENT ON COLUMN users.role IS 'Business role: owner (org-wide), manager (branch), storekeeper (inventory), sales_rep (sales)';
COMMENT ON COLUMN users.branch_id IS 'Home branch for managers, storekeepers, and sales reps';
COMMENT ON COLUMN users.manager_id IS 'Direct manager (storekeepers and sales reps report to branch manager)';
COMMENT ON COLUMN users.status IS 'active = can login, pending = awaiting activation, inactive = deactivated';

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_branch ON users(branch_id);
CREATE INDEX idx_users_manager ON users(manager_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_email ON users(email);

-- ============================================================================
-- ADD FOREIGN KEY FOR BRANCHES.MANAGER_ID
-- ============================================================================
-- Now that users table exists, add the foreign key constraint

ALTER TABLE branches
  ADD CONSTRAINT branches_manager_fkey 
  FOREIGN KEY (manager_id) 
  REFERENCES users(id) 
  ON DELETE SET NULL;

-- ============================================================================
-- USER PREFERENCES TABLE
-- ============================================================================
-- Per-user display preferences (no business logic)

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  date_format TEXT NOT NULL DEFAULT 'MMM D, YYYY' 
    CHECK (date_format IN ('MMM D, YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD')),
  default_report_period TEXT NOT NULL DEFAULT 'month' 
    CHECK (default_report_period IN ('today', 'week', 'month', 'quarter')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_preferences IS 'User-specific UI preferences';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get current user's tenant ID
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_user_tenant_id IS 'Returns tenant_id of the authenticated user';

-- Function to get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_user_role IS 'Returns role of the authenticated user';

-- Function to get current user's branch ID
CREATE OR REPLACE FUNCTION get_user_branch_id()
RETURNS UUID AS $$
  SELECT branch_id FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_user_branch_id IS 'Returns branch_id of the authenticated user';

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================
-- Automatically updates updated_at timestamp on row updates

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at IS 'Trigger function to auto-update updated_at timestamp';

-- Apply updated_at trigger to tables
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
