-- Migration: Create Business Logic Triggers
-- Created: 2026-01-14
-- Description: Automated business logic (inventory deduction, notifications)

-- ============================================================================
-- SALE INVENTORY DEDUCTION TRIGGER
-- ============================================================================
-- Automatically deduct inventory when a sale is completed

CREATE OR REPLACE FUNCTION process_sale_inventory()
RETURNS TRIGGER AS $$
DECLARE
  current_qty INTEGER;
BEGIN
  -- Only process completed sales
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != 'completed')) THEN
    
    -- Check if inventory record exists
    SELECT quantity_on_hand INTO current_qty
    FROM inventory_records
    WHERE branch_id = NEW.branch_id
      AND product_id = NEW.product_id;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No inventory record found for product % at branch %', NEW.product_id, NEW.branch_id;
    END IF;
    
    -- Check sufficient stock
    IF current_qty < NEW.quantity THEN
      RAISE EXCEPTION 'Insufficient stock: have %, need %', current_qty, NEW.quantity;
    END IF;
    
    -- Deduct from inventory
    UPDATE inventory_records
    SET quantity_on_hand = quantity_on_hand - NEW.quantity,
        last_updated = NOW()
    WHERE branch_id = NEW.branch_id
      AND product_id = NEW.product_id;
    
    -- Record movement
    INSERT INTO inventory_movements (
      tenant_id, branch_id, product_id, type, quantity,
      reference_type, reference_id, performed_by, created_at
    ) VALUES (
      NEW.tenant_id, NEW.branch_id, NEW.product_id, 'sale', -NEW.quantity,
      'sale', NEW.id, NEW.sales_rep_id, NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sale_inventory_deduction
  AFTER INSERT OR UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION process_sale_inventory();

COMMENT ON FUNCTION process_sale_inventory IS 'Automatically deducts inventory when sale is completed';

-- ============================================================================
-- STOCK REQUEST FULFILLMENT TRIGGER
-- ============================================================================
-- Deduct inventory and create movement when stock request is fulfilled

CREATE OR REPLACE FUNCTION process_stock_request_fulfillment()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process when status changes to fulfilled or partially_fulfilled
  IF (NEW.status IN ('fulfilled', 'partially_fulfilled')) 
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('fulfilled', 'partially_fulfilled')) 
     AND NEW.quantity_fulfilled > 0 THEN
    
    -- Calculate quantity to fulfill (difference if partial)
    DECLARE
      qty_to_issue INTEGER;
      already_issued INTEGER;
    BEGIN
      -- Get already issued quantity
      IF TG_OP = 'UPDATE' AND OLD.quantity_fulfilled IS NOT NULL THEN
        already_issued := OLD.quantity_fulfilled;
      ELSE
        already_issued := 0;
      END IF;
      
      qty_to_issue := NEW.quantity_fulfilled - already_issued;
      
      IF qty_to_issue > 0 THEN
        -- Deduct from inventory
        UPDATE inventory_records
        SET quantity_on_hand = quantity_on_hand - qty_to_issue,
            quantity_reserved = quantity_reserved - qty_to_issue,
            last_updated = NOW()
        WHERE branch_id = NEW.branch_id
          AND product_id = NEW.product_id;
        
        -- Record movement
        INSERT INTO inventory_movements (
          tenant_id, branch_id, product_id, type, quantity,
          reference_type, reference_id, performed_by, note, created_at
        ) VALUES (
          NEW.tenant_id, NEW.branch_id, NEW.product_id, 'stock_issued', -qty_to_issue,
          'stock_request', NEW.id, NEW.fulfilled_by, 
          'Stock request ' || NEW.id || ' fulfillment', NOW()
        );
      END IF;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_request_fulfillment
  AFTER INSERT OR UPDATE ON stock_requests
  FOR EACH ROW EXECUTE FUNCTION process_stock_request_fulfillment();

COMMENT ON FUNCTION process_stock_request_fulfillment IS 'Deducts inventory when stock request is fulfilled';

-- ============================================================================
-- PAYMENT NOTIFICATION TRIGGER
-- ============================================================================
-- Create notifications when payment status changes

CREATE OR REPLACE FUNCTION notify_payment_status_change()
RETURNS TRIGGER AS $$
DECLARE
  notification_type TEXT;
  recipient UUID;
  message TEXT;
BEGIN
  -- Determine notification type and recipient based on status change
  IF NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR OLD.status != 'submitted') THEN
    -- Notify manager: payment awaiting acknowledgement
    notification_type := 'payment_awaiting_acknowledgement';
    recipient := NEW.manager_id;
    message := 'Payment ' || NEW.id || ' from ' || (SELECT name FROM users WHERE id = NEW.sales_rep_id) || ' awaiting acknowledgement';
    
  ELSIF NEW.status = 'acknowledged' AND OLD.status != 'acknowledged' THEN
    -- Notify owner: payment awaiting confirmation
    notification_type := 'payment_awaiting_confirmation';
    SELECT id INTO recipient FROM users WHERE tenant_id = NEW.tenant_id AND role = 'owner' LIMIT 1;
    message := 'Payment ' || NEW.id || ' acknowledged by manager, awaiting confirmation';
    
  ELSIF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
    -- Notify rep: payment confirmed
    notification_type := 'payment_confirmed';
    recipient := NEW.sales_rep_id;
    message := 'Your payment ' || NEW.id || ' has been confirmed';
    
  ELSIF NEW.status = 'declined' AND OLD.status != 'declined' THEN
    -- Notify rep: payment declined
    notification_type := 'payment_declined';
    recipient := NEW.sales_rep_id;
    message := 'Your payment ' || NEW.id || ' was declined: ' || COALESCE(NEW.decline_reason, 'No reason provided');
  ELSE
    RETURN NEW;
  END IF;
  
  -- Create notification
  IF recipient IS NOT NULL THEN
    INSERT INTO notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
    VALUES (NEW.tenant_id, recipient, notification_type, 'payment', NEW.id, message);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_status_notification
  AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION notify_payment_status_change();

COMMENT ON FUNCTION notify_payment_status_change IS 'Creates notifications when payment status changes';

-- ============================================================================
-- STOCK REQUEST NOTIFICATION TRIGGER
-- ============================================================================
-- Create notifications when stock request status changes

CREATE OR REPLACE FUNCTION notify_stock_request_status_change()
RETURNS TRIGGER AS $$
DECLARE
  notification_type TEXT;
  recipient UUID;
  message TEXT;
  product_name TEXT;
BEGIN
  -- Get product name
  SELECT name INTO product_name FROM products WHERE id = NEW.product_id;
  
  -- Determine notification type and recipient
  IF NEW.status = 'pending' AND TG_OP = 'INSERT' THEN
    -- Notify storekeeper: new request
    notification_type := 'stock_request_submitted';
    SELECT id INTO recipient FROM users 
    WHERE branch_id = NEW.branch_id AND role = 'storekeeper' AND status = 'active' 
    LIMIT 1;
    message := 'New stock request ' || NEW.id || ' for ' || product_name;
    
  ELSIF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    -- Notify rep: request approved
    notification_type := 'stock_request_approved';
    recipient := NEW.rep_id;
    message := 'Stock request ' || NEW.id || ' approved: ' || NEW.quantity_approved || ' units of ' || product_name;
    
  ELSIF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
    -- Notify rep: request rejected
    notification_type := 'stock_request_rejected';
    recipient := NEW.rep_id;
    message := 'Stock request ' || NEW.id || ' rejected: ' || COALESCE(NEW.rejection_reason, 'No reason provided');
    
  ELSIF NEW.status = 'fulfilled' AND OLD.status != 'fulfilled' THEN
    -- Notify rep: request fulfilled
    notification_type := 'stock_request_fulfilled';
    recipient := NEW.rep_id;
    message := 'Stock request ' || NEW.id || ' fulfilled: ' || NEW.quantity_fulfilled || ' units ready for pickup';
  ELSE
    RETURN NEW;
  END IF;
  
  -- Create notification
  IF recipient IS NOT NULL THEN
    INSERT INTO notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
    VALUES (NEW.tenant_id, recipient, notification_type, 'stock_request', NEW.id, message);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_request_status_notification
  AFTER INSERT OR UPDATE ON stock_requests
  FOR EACH ROW EXECUTE FUNCTION notify_stock_request_status_change();

COMMENT ON FUNCTION notify_stock_request_status_change IS 'Creates notifications when stock request status changes';

-- ============================================================================
-- AUDIT LOG HELPER TRIGGER
-- ============================================================================
-- Automatically create audit logs for key operations

CREATE OR REPLACE FUNCTION auto_audit_sale()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    PERFORM create_audit_log(
      NEW.tenant_id,
      NEW.sales_rep_id,
      'Sale recorded',
      NEW.code || ' · ' || (SELECT name FROM products WHERE id = NEW.product_id),
      'sale',
      NEW.id::TEXT,
      false,
      jsonb_build_object(
        'branchId', NEW.branch_id,
        'productId', NEW.product_id,
        'quantity', NEW.quantity,
        'amount', NEW.quantity * NEW.unit_price
      )
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'voided' AND OLD.status != 'voided' THEN
    PERFORM create_audit_log(
      NEW.tenant_id,
      auth.uid(),
      'Sale voided',
      NEW.code || ' · Cancelled',
      'sale',
      NEW.id::TEXT,
      false,
      jsonb_build_object('reason', 'Status changed to voided')
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_sale_changes
  AFTER INSERT OR UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION auto_audit_sale();

COMMENT ON FUNCTION auto_audit_sale IS 'Automatically creates audit log entries for sales';

-- ============================================================================
-- INVENTORY ALERT VIEW
-- ============================================================================
-- Helper view for low stock alerts

CREATE OR REPLACE VIEW low_stock_items AS
SELECT 
  i.id,
  i.tenant_id,
  i.branch_id,
  b.name AS branch_name,
  i.product_id,
  p.name AS product_name,
  p.sku,
  i.quantity_on_hand,
  i.quantity_reserved,
  (i.quantity_on_hand - i.quantity_reserved) AS available_quantity,
  i.low_stock_threshold,
  i.last_updated
FROM inventory_records i
JOIN branches b ON i.branch_id = b.id
JOIN products p ON i.product_id = p.id
WHERE i.quantity_on_hand <= i.low_stock_threshold
  AND p.status = 'active';

COMMENT ON VIEW low_stock_items IS 'Products at or below low stock threshold';

-- ============================================================================
-- EXPIRING STOCK VIEW
-- ============================================================================
-- Helper view for stock nearing expiry

CREATE OR REPLACE VIEW expiring_stock AS
SELECT 
  sb.id,
  sb.tenant_id,
  sb.branch_id,
  b.name AS branch_name,
  sb.product_id,
  p.name AS product_name,
  p.sku,
  sb.batch_number,
  sb.expiry_date,
  sb.quantity_remaining,
  sb.received_at,
  DATE_PART('day', sb.expiry_date - CURRENT_DATE) AS days_until_expiry,
  t.expiry_alert_months
FROM stock_batches sb
JOIN branches b ON sb.branch_id = b.id
JOIN products p ON sb.product_id = p.id
JOIN tenants t ON sb.tenant_id = t.id
WHERE sb.quantity_remaining > 0
  AND sb.expiry_date > CURRENT_DATE
  AND sb.expiry_date <= CURRENT_DATE + (t.expiry_alert_months || ' months')::INTERVAL
  AND p.status = 'active'
ORDER BY sb.expiry_date ASC;

COMMENT ON VIEW expiring_stock IS 'Stock batches nearing expiry date (within configured alert period)';
