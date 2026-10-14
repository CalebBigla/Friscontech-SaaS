-- Migration: Create Products and Inventory Tables
-- Created: 2026-01-14
-- Description: Product catalog and branch inventory management

-- ============================================================================
-- PRODUCTS TABLE
-- ============================================================================
-- Shared product catalog for the entire organization

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'Piece',
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT products_tenant_sku_unique UNIQUE(tenant_id, sku)
);

COMMENT ON TABLE products IS 'Organization-wide product catalog';
COMMENT ON COLUMN products.sku IS 'Stock Keeping Unit - unique product identifier';
COMMENT ON COLUMN products.unit_price IS 'Selling price in naira (2 decimal places)';
COMMENT ON COLUMN products.unit_cost IS 'Cost price in naira (2 decimal places)';
COMMENT ON COLUMN products.status IS 'Products are soft-deleted (inactive) to preserve sales history';

CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_sku ON products(sku);

-- ============================================================================
-- INVENTORY RECORDS TABLE
-- ============================================================================
-- Current stock levels at each branch for each product

CREATE TABLE IF NOT EXISTS inventory_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0),
  reorder_level INTEGER NOT NULL DEFAULT 20 CHECK (reorder_level >= 0),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_branch_product_unique UNIQUE(branch_id, product_id),
  CONSTRAINT inventory_available_check CHECK (quantity_on_hand >= quantity_reserved)
);

COMMENT ON TABLE inventory_records IS 'Current inventory levels per branch per product';
COMMENT ON COLUMN inventory_records.quantity_on_hand IS 'Physical stock in warehouse';
COMMENT ON COLUMN inventory_records.quantity_reserved IS 'Stock allocated but not yet issued';
COMMENT ON COLUMN inventory_records.last_updated IS 'Last time stock quantity changed';

CREATE INDEX idx_inventory_tenant ON inventory_records(tenant_id);
CREATE INDEX idx_inventory_branch ON inventory_records(branch_id);
CREATE INDEX idx_inventory_product ON inventory_records(product_id);
CREATE INDEX idx_inventory_low_stock ON inventory_records(branch_id, product_id) 
  WHERE quantity_on_hand <= low_stock_threshold;

-- ============================================================================
-- INVENTORY MOVEMENTS TABLE
-- ============================================================================
-- Immutable audit trail of all stock changes

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('stock_added', 'stock_issued', 'sale', 'adjustment')),
  quantity INTEGER NOT NULL, -- Signed: positive = add, negative = deduct
  reference_type TEXT CHECK (reference_type IN ('stock_request', 'sale', 'manual')),
  reference_id TEXT,
  performed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE inventory_movements IS 'Immutable audit trail of all inventory changes';
COMMENT ON COLUMN inventory_movements.quantity IS 'Signed delta: positive adds stock, negative deducts';
COMMENT ON COLUMN inventory_movements.reference_type IS 'What triggered this movement';
COMMENT ON COLUMN inventory_movements.reference_id IS 'ID of the triggering entity (sale ID, request ID, etc.)';

CREATE INDEX idx_movements_tenant ON inventory_movements(tenant_id);
CREATE INDEX idx_movements_branch ON inventory_movements(branch_id);
CREATE INDEX idx_movements_product ON inventory_movements(product_id);
CREATE INDEX idx_movements_type ON inventory_movements(type);
CREATE INDEX idx_movements_date ON inventory_movements(created_at DESC);
CREATE INDEX idx_movements_reference ON inventory_movements(reference_type, reference_id);

-- ============================================================================
-- STOCK BATCHES TABLE
-- ============================================================================
-- Track product batches with expiry dates for FEFO (First-Expiry-First-Out)

CREATE TABLE IF NOT EXISTS stock_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_number TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  quantity_received INTEGER NOT NULL CHECK (quantity_received > 0),
  quantity_remaining INTEGER NOT NULL CHECK (quantity_remaining >= 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_batches_tenant_batch_unique UNIQUE(tenant_id, batch_number),
  CONSTRAINT batch_qty_check CHECK (quantity_remaining <= quantity_received)
);

COMMENT ON TABLE stock_batches IS 'Product batches with expiry dates for FEFO stock management';
COMMENT ON COLUMN stock_batches.quantity_remaining IS 'Stock consumed from oldest expiry first (FEFO)';

CREATE INDEX idx_batches_tenant ON stock_batches(tenant_id);
CREATE INDEX idx_batches_branch ON stock_batches(branch_id);
CREATE INDEX idx_batches_product ON stock_batches(product_id);
CREATE INDEX idx_batches_expiry ON stock_batches(expiry_date);
CREATE INDEX idx_batches_remaining ON stock_batches(product_id, expiry_date) 
  WHERE quantity_remaining > 0;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get available inventory (on_hand - reserved)
CREATE OR REPLACE FUNCTION get_available_inventory(
  p_branch_id UUID,
  p_product_id UUID
)
RETURNS INTEGER AS $$
  SELECT COALESCE(quantity_on_hand - quantity_reserved, 0)
  FROM inventory_records
  WHERE branch_id = p_branch_id AND product_id = p_product_id;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_available_inventory IS 'Returns available stock for a product at a branch';

-- Function to check if product has low stock
CREATE OR REPLACE FUNCTION is_low_stock(
  p_branch_id UUID,
  p_product_id UUID
)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(quantity_on_hand <= low_stock_threshold, false)
  FROM inventory_records
  WHERE branch_id = p_branch_id AND product_id = p_product_id;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION is_low_stock IS 'Returns true if product is at or below low stock threshold';

-- ============================================================================
-- APPLY TRIGGERS
-- ============================================================================

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
