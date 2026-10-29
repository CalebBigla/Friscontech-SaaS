-- Migration: Create Customers and Sales Tables
-- Created: 2026-01-14
-- Description: Customer accounts, sales transactions, and customer payments

-- ============================================================================
-- CUSTOMERS TABLE
-- ============================================================================
-- Customer accounts for credit sales and account management

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT NOT NULL,
  credit_limit NUMERIC(12,2) CHECK (credit_limit >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE customers IS 'Customer accounts for credit sales';
COMMENT ON COLUMN customers.credit_limit IS 'Maximum outstanding balance allowed (owner-set, null = unlimited)';
COMMENT ON COLUMN customers.branch_id IS 'Home branch (can be null for organization-wide customers)';

CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_customers_branch ON customers(branch_id);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_created_by ON customers(created_by);
CREATE INDEX idx_customers_name ON customers(name);

-- ============================================================================
-- SALES TABLE
-- ============================================================================
-- Individual sale line items (one row per product sold)

CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  sales_rep_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_id UUID, -- Groups lines of one multi-item order
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  sale_date DATE NOT NULL,
  walk_in_name TEXT,
  walk_in_phone TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'voided')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sales_tenant_code_unique UNIQUE(tenant_id, code),
  CONSTRAINT sale_customer_or_walk_in CHECK (
    (customer_id IS NOT NULL AND walk_in_name IS NULL AND walk_in_phone IS NULL) OR
    (customer_id IS NULL AND walk_in_name IS NOT NULL)
  )
);

COMMENT ON TABLE sales IS 'Sales transaction line items';
COMMENT ON COLUMN sales.code IS 'Unique sale code (e.g., SAL-10001)';
COMMENT ON COLUMN sales.customer_id IS 'Customer account sale (null = walk-in)';
COMMENT ON COLUMN sales.order_id IS 'Groups multiple lines from one order';
COMMENT ON COLUMN sales.status IS 'completed = counted in revenue, pending = not yet final, voided = cancelled';

CREATE INDEX idx_sales_tenant ON sales(tenant_id);
CREATE INDEX idx_sales_branch ON sales(branch_id);
CREATE INDEX idx_sales_rep ON sales(sales_rep_id);
CREATE INDEX idx_sales_product ON sales(product_id);
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sales_order ON sales(order_id);
CREATE INDEX idx_sales_date ON sales(sale_date DESC);
CREATE INDEX idx_sales_status ON sales(status);
CREATE INDEX idx_sales_code ON sales(code);

-- ============================================================================
-- CUSTOMER PAYMENTS TABLE
-- ============================================================================
-- Credits to customer accounts (follows same approval chain as rep payments)

CREATE TABLE IF NOT EXISTS customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  manager_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
  reference TEXT,
  received_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_id UUID,
  payment_date DATE NOT NULL,
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

COMMENT ON TABLE customer_payments IS 'Customer account payment credits (3-step approval chain)';
COMMENT ON COLUMN customer_payments.status IS 'submitted → manager acknowledges → owner confirms';
COMMENT ON COLUMN customer_payments.proof_name IS 'Optional proof file attached by manager';

CREATE INDEX idx_customer_payments_tenant ON customer_payments(tenant_id);
CREATE INDEX idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX idx_customer_payments_branch ON customer_payments(branch_id);
CREATE INDEX idx_customer_payments_manager ON customer_payments(manager_id);
CREATE INDEX idx_customer_payments_status ON customer_payments(status);
CREATE INDEX idx_customer_payments_date ON customer_payments(payment_date DESC);
CREATE INDEX idx_customer_payments_received_by ON customer_payments(received_by);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate customer balance (total sales - confirmed payments)
CREATE OR REPLACE FUNCTION get_customer_balance(p_customer_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  total_sales NUMERIC;
  total_payments NUMERIC;
BEGIN
  -- Sum completed customer sales
  SELECT COALESCE(SUM(quantity * unit_price), 0)
  INTO total_sales
  FROM sales
  WHERE customer_id = p_customer_id
    AND status = 'completed';
  
  -- Sum confirmed customer payments
  SELECT COALESCE(SUM(amount), 0)
  INTO total_payments
  FROM customer_payments
  WHERE customer_id = p_customer_id
    AND status = 'confirmed';
  
  RETURN total_sales - total_payments;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_customer_balance IS 'Returns outstanding balance for a customer (sales - confirmed payments)';

-- Function to check if customer can place order
CREATE OR REPLACE FUNCTION can_customer_order(
  p_customer_id UUID,
  p_order_amount NUMERIC
)
RETURNS BOOLEAN AS $$
DECLARE
  current_balance NUMERIC;
  credit_limit NUMERIC;
BEGIN
  -- Get current balance
  current_balance := get_customer_balance(p_customer_id);
  
  -- Get credit limit (null = unlimited)
  SELECT c.credit_limit INTO credit_limit
  FROM customers c
  WHERE c.id = p_customer_id;
  
  -- No limit set = allowed
  IF credit_limit IS NULL THEN
    RETURN true;
  END IF;
  
  -- Check if new order would exceed limit
  RETURN (current_balance + p_order_amount) <= credit_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION can_customer_order IS 'Checks if customer can place an order without exceeding credit limit';

-- ============================================================================
-- APPLY TRIGGERS
-- ============================================================================

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_sales_updated_at
  BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_customer_payments_updated_at
  BEFORE UPDATE ON customer_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
