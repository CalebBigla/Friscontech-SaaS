-- Migration: Create Financial Workflows Tables
-- Created: 2026-01-14
-- Description: Rep payments, expenses, and remittances (manager → owner, owner → payees)

-- ============================================================================
-- PAYMENTS TABLE (Rep → Manager → Owner)
-- ============================================================================
-- Sales rep payment submissions with 3-step approval chain

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, -- e.g., 'PAY-3001'
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  sales_rep_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  manager_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  period TEXT NOT NULL, -- YYYY-MM format
  cash_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
  transfer_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (transfer_amount >= 0),
  transfer_reference TEXT,
  proof_name TEXT,
  -- Three-step approval chain
  status TEXT NOT NULL DEFAULT 'submitted' 
    CHECK (status IN ('submitted', 'acknowledged', 'declined', 'confirmed')),
  submitted_at TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  declined_at TIMESTAMPTZ,
  declined_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decline_reason TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE payments IS 'Sales rep payment submissions (submitted → acknowledged → confirmed)';
COMMENT ON COLUMN payments.period IS 'Payment period in YYYY-MM format';
COMMENT ON COLUMN payments.proof_name IS 'Optional proof of transfer attached by manager';

CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_branch ON payments(branch_id);
CREATE INDEX idx_payments_rep ON payments(sales_rep_id);
CREATE INDEX idx_payments_manager ON payments(manager_id);
CREATE INDEX idx_payments_period ON payments(period);
CREATE INDEX idx_payments_status ON payments(status);

-- ============================================================================
-- EXPENSES TABLE
-- ============================================================================
-- Manager and Owner operating expenses

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY, -- e.g., 'EXP-4101'
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL 
    CHECK (category IN ('transport', 'logistics', 'office', 'communication', 'maintenance', 'other')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL,
  description TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'voided')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT expense_manager_or_owner CHECK (
    (manager_id IS NOT NULL AND owner_id IS NULL) OR
    (manager_id IS NULL AND owner_id IS NOT NULL)
  )
);

COMMENT ON TABLE expenses IS 'Manager and Owner operating expenses';
COMMENT ON COLUMN expenses.branch_id IS 'Branch expense (manager) or null (owner org-wide)';
COMMENT ON COLUMN expenses.status IS 'recorded = active, voided = cancelled';

CREATE INDEX idx_expenses_tenant ON expenses(tenant_id);
CREATE INDEX idx_expenses_branch ON expenses(branch_id);
CREATE INDEX idx_expenses_manager ON expenses(manager_id);
CREATE INDEX idx_expenses_owner ON expenses(owner_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_category ON expenses(category);

-- ============================================================================
-- MANAGER REMITTANCES TABLE
-- ============================================================================
-- Branch manager remittances to owner (net of payments - expenses)

CREATE TABLE IF NOT EXISTS manager_remittances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  manager_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  period TEXT NOT NULL, -- YYYY-MM
  -- Snapshot amounts (computed at submission)
  total_received NUMERIC(12,2) NOT NULL CHECK (total_received >= 0),
  expense_amount NUMERIC(12,2) NOT NULL CHECK (expense_amount >= 0),
  net_remittance_due NUMERIC(12,2) NOT NULL CHECK (net_remittance_due >= 0),
  -- Actual remittance
  cash_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
  transfer_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (transfer_amount >= 0),
  outstanding_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (outstanding_amount >= 0),
  transfer_reference TEXT,
  -- Status workflow
  status TEXT NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'submitted', 'confirmed', 'declined')),
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  declined_at TIMESTAMPTZ,
  declined_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decline_reason TEXT,
  note TEXT,
  -- References to included payments and expenses
  payment_ids JSONB NOT NULL DEFAULT '[]',
  expense_ids JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE manager_remittances IS 'Manager branch remittances to owner';
COMMENT ON COLUMN manager_remittances.total_received IS 'Snapshot: sum of confirmed payments at submission';
COMMENT ON COLUMN manager_remittances.expense_amount IS 'Snapshot: sum of recorded expenses at submission';
COMMENT ON COLUMN manager_remittances.net_remittance_due IS 'total_received - expense_amount';
COMMENT ON COLUMN manager_remittances.outstanding_amount IS 'net_remittance_due - (cash + transfer)';
COMMENT ON COLUMN manager_remittances.payment_ids IS 'Array of payment IDs included in this remittance';
COMMENT ON COLUMN manager_remittances.expense_ids IS 'Array of expense IDs included in this remittance';

CREATE INDEX idx_remittances_tenant ON manager_remittances(tenant_id);
CREATE INDEX idx_remittances_branch ON manager_remittances(branch_id);
CREATE INDEX idx_remittances_manager ON manager_remittances(manager_id);
CREATE INDEX idx_remittances_period ON manager_remittances(period);
CREATE INDEX idx_remittances_status ON manager_remittances(status);

-- ============================================================================
-- OWNER REMITTANCES TABLE
-- ============================================================================
-- Owner payments to external payees (suppliers, landlords, etc.)

CREATE TABLE IF NOT EXISTS owner_remittances (
  id TEXT PRIMARY KEY, -- e.g., 'REM-5001'
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payee_type TEXT NOT NULL 
    CHECK (payee_type IN ('supplier', 'landlord', 'utility', 'contractor', 'other')),
  payee_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'cheque')),
  reference TEXT,
  purpose TEXT NOT NULL,
  remittance_date DATE NOT NULL,
  note TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE owner_remittances IS 'Owner payments to external payees';

CREATE INDEX idx_owner_remittances_tenant ON owner_remittances(tenant_id);
CREATE INDEX idx_owner_remittances_payee ON owner_remittances(payee_name);
CREATE INDEX idx_owner_remittances_date ON owner_remittances(remittance_date DESC);
CREATE INDEX idx_owner_remittances_created_by ON owner_remittances(created_by);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate total sales for a rep in a period
CREATE OR REPLACE FUNCTION get_rep_total_sales(
  p_rep_id UUID,
  p_period TEXT, -- 'YYYY-MM'
  p_include_customer_sales BOOLEAN DEFAULT false
)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(quantity * unit_price), 0)
  FROM sales
  WHERE sales_rep_id = p_rep_id
    AND status = 'completed'
    AND TO_CHAR(sale_date, 'YYYY-MM') = p_period
    AND (p_include_customer_sales OR customer_id IS NULL); -- Walk-in only unless flag set
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_rep_total_sales IS 'Returns total sales for a rep in a given period';

-- Function to calculate payment outstanding
CREATE OR REPLACE FUNCTION get_payment_outstanding(
  p_rep_id UUID,
  p_period TEXT
)
RETURNS NUMERIC AS $$
DECLARE
  total_sales NUMERIC;
  cash_amount NUMERIC;
  transfer_amount NUMERIC;
BEGIN
  -- Get total walk-in sales
  total_sales := get_rep_total_sales(p_rep_id, p_period, false);
  
  -- Get payment amounts
  SELECT 
    COALESCE(SUM(p.cash_amount), 0),
    COALESCE(SUM(p.transfer_amount), 0)
  INTO cash_amount, transfer_amount
  FROM payments p
  WHERE p.sales_rep_id = p_rep_id
    AND p.period = p_period
    AND p.status IN ('submitted', 'acknowledged', 'confirmed');
  
  RETURN GREATEST(total_sales - (cash_amount + transfer_amount), 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_payment_outstanding IS 'Returns outstanding payment amount for a rep';

-- ============================================================================
-- APPLY TRIGGERS
-- ============================================================================

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_manager_remittances_updated_at
  BEFORE UPDATE ON manager_remittances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_owner_remittances_updated_at
  BEFORE UPDATE ON owner_remittances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
