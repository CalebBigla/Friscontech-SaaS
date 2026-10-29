-- Migration: Drop Flawed RLS Policies Causing Cross-Tenant Access
-- Created: 2026-10-21
-- Description: Removes legacy RLS policies that lack tenant isolation, enabling cross-tenant data access
-- WARNING: This migration removes policies that were never intended for production use but remained
--          active due to policy accumulation. Verified that corrected policies with proper tenant
--          isolation remain in place.

-- ============================================================================
-- BRANCHES TABLE
-- ============================================================================

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)
DROP POLICY IF EXISTS branches_owner_all ON branches;
DROP POLICY IF EXISTS branches_manager_own ON branches;

-- ============================================================================
-- SALES TABLE
-- ============================================================================

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)
DROP POLICY IF EXISTS sales_owner_all ON sales;
DROP POLICY IF EXISTS sales_manager_branch ON sales;
DROP POLICY IF EXISTS sales_rep_own ON sales;

-- ============================================================================
-- INVENTORY RECORDS TABLE
-- ============================================================================

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)
DROP POLICY IF EXISTS inventory_owner_all ON inventory_records;
DROP POLICY IF EXISTS inventory_storekeeper_branch ON inventory_records;

-- ============================================================================
-- INVENTORY MOVEMENTS TABLE
-- ============================================================================

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)
DROP POLICY IF EXISTS inventory_movements_owner_all ON inventory_movements;
DROP POLICY IF EXISTS inventory_movements_storekeeper ON inventory_movements;

-- ============================================================================
-- STOCK BATCHES TABLE
-- ============================================================================

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)
DROP POLICY IF EXISTS stock_batches_owner ON stock_batches;
DROP POLICY IF EXISTS stock_batches_storekeeper ON stock_batches;

-- ============================================================================
-- CUSTOMERS TABLE
-- ============================================================================

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)
DROP POLICY IF EXISTS customers_owner_all ON customers;
DROP POLICY IF EXISTS customers_storekeeper_branch ON customers;
DROP POLICY IF EXISTS customers_rep_all ON customers;

-- ============================================================================
-- CUSTOMER PAYMENTS TABLE
-- ============================================================================

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)
DROP POLICY IF EXISTS customer_payments_owner_all ON customer_payments;
DROP POLICY IF EXISTS customer_payments_manager_branch ON customer_payments;

-- ============================================================================
-- PAYMENTS TABLE
-- ============================================================================

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)
DROP POLICY IF EXISTS payments_owner_all ON payments;
DROP POLICY IF EXISTS payments_manager_branch ON payments;

-- ============================================================================
-- EXPENSES TABLE
-- ============================================================================

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)
DROP POLICY IF EXISTS expenses_owner_all ON expenses;
DROP POLICY IF EXISTS expenses_manager_branch ON expenses;

-- ============================================================================
-- MANAGER REMITTANCES TABLE
-- ============================================================================

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)
DROP POLICY IF EXISTS manager_remittances_owner_all ON manager_remittances;
DROP POLICY IF EXISTS manager_remittances_manager_own ON manager_remittances;

-- ============================================================================
-- OWNER REMITTANCES TABLE
-- ============================================================================

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)
DROP POLICY IF EXISTS owner_remittances_owner_only ON owner_remittances;

-- ============================================================================
-- TARGETS TABLE
-- ============================================================================

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)
DROP POLICY IF EXISTS targets_owner_all ON targets;
DROP POLICY IF EXISTS targets_manager_view_branch ON targets;
DROP POLICY IF EXISTS targets_rep_view_own ON targets;

-- ============================================================================
-- APPROVALS TABLE
-- ============================================================================

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)
DROP POLICY IF EXISTS approvals_owner_all ON approval_requests;
DROP POLICY IF EXISTS approvals_manager_branch ON approval_requests;
DROP POLICY IF EXISTS approvals_requester ON approval_requests;

-- ============================================================================
-- ONBOARDINGS TABLE
-- ============================================================================

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)
DROP POLICY IF EXISTS onboardings_owner_all ON onboardings;
DROP POLICY IF EXISTS onboardings_user_own ON onboardings;

-- ============================================================================
-- ONBOARDING FILES TABLE
-- ============================================================================

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)
DROP POLICY IF EXISTS onboarding_files_owner ON onboarding_files;

-- ============================================================================
-- NOTIFICATIONS TABLE
-- ============================================================================
-- The own-recipient policy is retained; the follow-up migration adds the
-- restrictive tenant boundary so recipient access remains both tenant- and
-- user-scoped.

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)

-- ============================================================================
-- USER PREFERENCES TABLE
-- ============================================================================
-- The self-only user_preferences_own policy is retained and tenant-guarded by
-- the follow-up migration.

-- Flawed policies allowing cross-tenant access (missing tenant_id restrictions)

-- ============================================================================
-- ACTIVITIES TABLE (AUDIT LOG)
-- ============================================================================
-- NOTE: No flawed policies found for activities table - policies are already correct
--       activities_read_tenant and activities_insert_own properly restrict access

-- Corrected tenant and role policies are installed by the following
-- 20261021100000_reconcile_remaining_rls_guards.sql migration.
