-- Migration: Enable RLS and Create Security Policies
-- Created: 2026-01-14
-- Description: Row Level Security policies for tenant isolation and role-based access

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboardings ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TENANT POLICIES (Base Isolation)
-- ============================================================================
-- All users can only access their own tenant's data

CREATE POLICY tenant_isolation_tenants ON tenants
  FOR ALL
  USING (id = get_user_tenant_id());

CREATE POLICY tenant_isolation_branches ON branches
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_users ON users
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_products ON products
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_inventory ON inventory_records
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_movements ON inventory_movements
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_batches ON stock_batches
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_customers ON customers
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_sales ON sales
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_customer_payments ON customer_payments
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_payments ON payments
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_expenses ON expenses
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_manager_remittances ON manager_remittances
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_owner_remittances ON owner_remittances
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_stock_requests ON stock_requests
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_targets ON targets
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_approvals ON approval_requests
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_onboardings ON onboardings
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_activities ON activities
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_isolation_notifications ON notifications
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

-- ============================================================================
-- BRANCHES - Owner sees all, Manager sees own
-- ============================================================================

CREATE POLICY branches_owner_all ON branches
  FOR ALL
  USING (get_user_role() = 'owner');

CREATE POLICY branches_manager_own ON branches
  FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND id = get_user_branch_id()
  );

-- ============================================================================
-- SALES - Owner/Manager see branch sales, Rep sees own
-- ============================================================================

CREATE POLICY sales_owner_all ON sales
  FOR ALL
  USING (get_user_role() = 'owner');

CREATE POLICY sales_manager_branch ON sales
  FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND branch_id = get_user_branch_id()
  );

CREATE POLICY sales_rep_own ON sales
  FOR ALL
  USING (
    get_user_role() = 'sales_rep'
    AND sales_rep_id = auth.uid()
  );

-- ============================================================================
-- INVENTORY - Storekeeper manages own branch, Owner views all
-- ============================================================================

CREATE POLICY inventory_storekeeper_branch ON inventory_records
  FOR ALL
  USING (
    get_user_role() = 'storekeeper'
    AND branch_id = get_user_branch_id()
  );

CREATE POLICY inventory_owner_all ON inventory_records
  FOR SELECT
  USING (get_user_role() = 'owner');

CREATE POLICY inventory_movements_storekeeper ON inventory_movements
  FOR ALL
  USING (
    get_user_role() IN ('storekeeper', 'owner')
    AND (branch_id = get_user_branch_id() OR get_user_role() = 'owner')
  );

CREATE POLICY stock_batches_storekeeper ON stock_batches
  FOR ALL
  USING (
    get_user_role() = 'storekeeper'
    AND branch_id = get_user_branch_id()
  );

CREATE POLICY stock_batches_owner ON stock_batches
  FOR SELECT
  USING (get_user_role() = 'owner');

-- ============================================================================
-- STOCK REQUESTS - Rep creates, Storekeeper approves, both see
-- ============================================================================

CREATE POLICY stock_requests_rep_own ON stock_requests
  FOR ALL
  USING (
    get_user_role() = 'sales_rep'
    AND rep_id = auth.uid()
  );

CREATE POLICY stock_requests_storekeeper_branch ON stock_requests
  FOR ALL
  USING (
    get_user_role() = 'storekeeper'
    AND branch_id = get_user_branch_id()
  );

-- ============================================================================
-- CUSTOMERS - Rep manages, Owner views
-- ============================================================================

CREATE POLICY customers_rep_all ON customers
  FOR ALL
  USING (
    get_user_role() IN ('sales_rep', 'storekeeper', 'owner')
  );

CREATE POLICY customer_payments_rep_submit ON customer_payments
  FOR INSERT
  WITH CHECK (
    get_user_role() = 'sales_rep'
    AND received_by = auth.uid()
  );

CREATE POLICY customer_payments_rep_own ON customer_payments
  FOR SELECT
  USING (
    get_user_role() = 'sales_rep'
    AND received_by = auth.uid()
  );

CREATE POLICY customer_payments_manager_branch ON customer_payments
  FOR ALL
  USING (
    get_user_role() = 'manager'
    AND branch_id = get_user_branch_id()
  );

CREATE POLICY customer_payments_owner_all ON customer_payments
  FOR ALL
  USING (get_user_role() = 'owner');

-- ============================================================================
-- PAYMENTS - Rep submits, Manager acknowledges, Owner confirms
-- ============================================================================

CREATE POLICY payments_rep_own ON payments
  FOR ALL
  USING (
    get_user_role() = 'sales_rep'
    AND sales_rep_id = auth.uid()
  );

CREATE POLICY payments_manager_branch ON payments
  FOR ALL
  USING (
    get_user_role() = 'manager'
    AND branch_id = get_user_branch_id()
  );

CREATE POLICY payments_owner_all ON payments
  FOR ALL
  USING (get_user_role() = 'owner');

-- ============================================================================
-- EXPENSES - Manager creates for branch, Owner creates org-wide
-- ============================================================================

CREATE POLICY expenses_manager_branch ON expenses
  FOR ALL
  USING (
    get_user_role() = 'manager'
    AND manager_id = auth.uid()
  );

CREATE POLICY expenses_owner_all ON expenses
  FOR ALL
  USING (get_user_role() = 'owner');

-- ============================================================================
-- REMITTANCES - Manager submits, Owner confirms
-- ============================================================================

CREATE POLICY manager_remittances_manager_own ON manager_remittances
  FOR ALL
  USING (
    get_user_role() = 'manager'
    AND manager_id = auth.uid()
  );

CREATE POLICY manager_remittances_owner_all ON manager_remittances
  FOR ALL
  USING (get_user_role() = 'owner');

CREATE POLICY owner_remittances_owner_only ON owner_remittances
  FOR ALL
  USING (get_user_role() = 'owner');

-- ============================================================================
-- TARGETS - Owner manages all
-- ============================================================================

CREATE POLICY targets_owner_all ON targets
  FOR ALL
  USING (get_user_role() = 'owner');

CREATE POLICY targets_manager_view_branch ON targets
  FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND branch_id = get_user_branch_id()
  );

CREATE POLICY targets_rep_view_own ON targets
  FOR SELECT
  USING (
    get_user_role() = 'sales_rep'
    AND user_id = auth.uid()
  );

-- ============================================================================
-- APPROVALS - Requester and reviewer see relevant requests
-- ============================================================================

CREATE POLICY approvals_requester ON approval_requests
  FOR ALL
  USING (requested_by = auth.uid());

CREATE POLICY approvals_manager_branch ON approval_requests
  FOR ALL
  USING (
    get_user_role() = 'manager'
    AND branch_id = get_user_branch_id()
  );

CREATE POLICY approvals_owner_all ON approval_requests
  FOR ALL
  USING (get_user_role() = 'owner');

-- ============================================================================
-- ONBOARDING - Owner sees all, user sees own
-- ============================================================================

CREATE POLICY onboardings_owner_all ON onboardings
  FOR ALL
  USING (get_user_role() = 'owner');

CREATE POLICY onboardings_user_own ON onboardings
  FOR SELECT
  USING (user_id = auth.uid());

-- Public access for onboarding forms via token (special case)
CREATE POLICY onboardings_public_by_token ON onboardings
  FOR SELECT
  USING (
    token_revoked = false
    AND token_used = false
    AND token_expires_at > NOW()
  );

CREATE POLICY onboarding_files_owner ON onboarding_files
  FOR ALL
  USING (
    get_user_role() = 'owner'
    OR onboarding_id IN (
      SELECT id FROM onboardings WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- ACTIVITIES (Audit Logs) - All can read own tenant, insert own actions
-- ============================================================================

CREATE POLICY activities_read_tenant ON activities
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY activities_insert_own ON activities
  FOR INSERT
  WITH CHECK (
    actor_id = auth.uid()
    AND tenant_id = get_user_tenant_id()
  );

-- ============================================================================
-- NOTIFICATIONS - Users see only their own
-- ============================================================================

CREATE POLICY notifications_own ON notifications
  FOR ALL
  USING (recipient_id = auth.uid());

-- ============================================================================
-- USER PREFERENCES - Users manage only their own
-- ============================================================================

CREATE POLICY user_preferences_own ON user_preferences
  FOR ALL
  USING (user_id = auth.uid());

-- ============================================================================
-- PRODUCTS - Storekeeper and Owner can manage
-- ============================================================================

CREATE POLICY products_storekeeper_manage ON products
  FOR ALL
  USING (get_user_role() IN ('storekeeper', 'owner'));

CREATE POLICY products_others_read ON products
  FOR SELECT
  USING (get_user_role() IN ('manager', 'sales_rep'));
