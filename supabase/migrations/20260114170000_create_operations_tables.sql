-- Migration: Create Operations Tables
-- Created: 2026-01-14
-- Description: Stock requests, targets, and approval workflows

-- ============================================================================
-- STOCK REQUESTS TABLE
-- ============================================================================
-- Sales rep stock requests (request → approve → fulfill workflow)

CREATE TABLE IF NOT EXISTS stock_requests (
  id TEXT PRIMARY KEY, -- e.g., 'SR-1093'
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  rep_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_requested INTEGER NOT NULL CHECK (quantity_requested > 0),
  quantity_approved INTEGER CHECK (quantity_approved > 0),
  quantity_fulfilled INTEGER CHECK (quantity_fulfilled >= 0),
  batch_id UUID, -- Groups multiple products requested together
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Normal', 'High')),
  -- Status workflow
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'approved', 'partially_fulfilled', 'fulfilled', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  fulfilled_at TIMESTAMPTZ,
  fulfilled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  -- Rep acknowledgement
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_request_status_logic CHECK (
    (status = 'approved' AND quantity_approved IS NOT NULL) OR
    (status = 'partially_fulfilled' AND quantity_fulfilled IS NOT NULL AND quantity_fulfilled < quantity_approved) OR
    (status = 'fulfilled' AND quantity_fulfilled IS NOT NULL AND quantity_fulfilled = quantity_approved) OR
    (status = 'rejected' AND rejection_reason IS NOT NULL) OR
    status = 'pending'
  )
);

COMMENT ON TABLE stock_requests IS 'Sales rep stock request workflow';
COMMENT ON COLUMN stock_requests.batch_id IS 'Groups multiple products requested in one submission';
COMMENT ON COLUMN stock_requests.quantity_approved IS 'Storekeeper may approve less than requested';
COMMENT ON COLUMN stock_requests.quantity_fulfilled IS 'Actual stock issued (may be partial)';
COMMENT ON COLUMN stock_requests.acknowledged_at IS 'Rep confirms receipt after fulfillment';

CREATE INDEX idx_requests_tenant ON stock_requests(tenant_id);
CREATE INDEX idx_requests_branch ON stock_requests(branch_id);
CREATE INDEX idx_requests_rep ON stock_requests(rep_id);
CREATE INDEX idx_requests_product ON stock_requests(product_id);
CREATE INDEX idx_requests_status ON stock_requests(status);
CREATE INDEX idx_requests_batch ON stock_requests(batch_id);
CREATE INDEX idx_requests_date ON stock_requests(requested_at DESC);

-- ============================================================================
-- TARGETS TABLE
-- ============================================================================
-- Monthly sales targets for branches and individual reps

CREATE TABLE IF NOT EXISTS targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('branch', 'rep')),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- YYYY-MM
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT targets_branch_scope CHECK (
    (scope = 'branch' AND user_id IS NULL) OR
    (scope = 'rep' AND user_id IS NOT NULL)
  ),
  CONSTRAINT targets_unique UNIQUE(tenant_id, scope, branch_id, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::UUID), month)
);

COMMENT ON TABLE targets IS 'Monthly sales targets for branches and sales reps';
COMMENT ON COLUMN targets.scope IS 'branch = branch-wide target, rep = individual rep target';
COMMENT ON COLUMN targets.user_id IS 'Null for branch targets, user ID for rep targets';

CREATE INDEX idx_targets_tenant ON targets(tenant_id);
CREATE INDEX idx_targets_branch ON targets(branch_id);
CREATE INDEX idx_targets_user ON targets(user_id);
CREATE INDEX idx_targets_month ON targets(month);
CREATE INDEX idx_targets_scope ON targets(scope);

-- ============================================================================
-- APPROVAL REQUESTS TABLE
-- ============================================================================
-- Permission workflow (storekeeper → manager, manager → owner)

CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('stock_addition', 'product_deactivation', 'team_member')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at TIMESTAMPTZ NOT NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  note TEXT,
  -- Emergency handling
  emergency BOOLEAN DEFAULT FALSE,
  emergency_reason TEXT,
  applied_at TIMESTAMPTZ, -- When emergency change was applied
  -- Type-specific fields
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  quantity INTEGER,
  batch_number TEXT,
  expiry_date DATE,
  member_data JSONB, -- For team_member approvals: {name, email, role, branchId}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE approval_requests IS 'Approval workflow for permission-required actions';
COMMENT ON COLUMN approval_requests.emergency IS 'True if action was applied before approval (needs post-review)';
COMMENT ON COLUMN approval_requests.member_data IS 'JSON data for team member onboarding approval';

CREATE INDEX idx_approvals_tenant ON approval_requests(tenant_id);
CREATE INDEX idx_approvals_type ON approval_requests(type);
CREATE INDEX idx_approvals_status ON approval_requests(status);
CREATE INDEX idx_approvals_branch ON approval_requests(branch_id);
CREATE INDEX idx_approvals_requested_by ON approval_requests(requested_by);
CREATE INDEX idx_approvals_product ON approval_requests(product_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get target achievement percentage
CREATE OR REPLACE FUNCTION get_target_achievement(
  p_target_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
  target_record RECORD;
  achieved_amount NUMERIC;
BEGIN
  -- Get target details
  SELECT * INTO target_record
  FROM targets
  WHERE id = p_target_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Calculate achieved sales
  IF target_record.scope = 'branch' THEN
    -- Branch target: sum all sales in branch
    SELECT COALESCE(SUM(quantity * unit_price), 0)
    INTO achieved_amount
    FROM sales
    WHERE branch_id = target_record.branch_id
      AND status = 'completed'
      AND TO_CHAR(sale_date, 'YYYY-MM') = target_record.month;
  ELSE
    -- Rep target: sum rep's sales
    SELECT COALESCE(SUM(quantity * unit_price), 0)
    INTO achieved_amount
    FROM sales
    WHERE sales_rep_id = target_record.user_id
      AND status = 'completed'
      AND TO_CHAR(sale_date, 'YYYY-MM') = target_record.month;
  END IF;
  
  -- Return percentage
  IF target_record.amount = 0 THEN
    RETURN 0;
  END IF;
  
  RETURN (achieved_amount / target_record.amount) * 100;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_target_achievement IS 'Returns target achievement percentage for a given target';

-- ============================================================================
-- APPLY TRIGGERS
-- ============================================================================

CREATE TRIGGER update_stock_requests_updated_at
  BEFORE UPDATE ON stock_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_targets_updated_at
  BEFORE UPDATE ON targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_approval_requests_updated_at
  BEFORE UPDATE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
