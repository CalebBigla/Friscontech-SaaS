-- Approval notifications between storekeeper, manager and Owner.
--
-- Rep stock requests already notify the storekeeper and the rep, but approvals
-- did not notify anyone: a manager learned of a storekeeper's stock addition or
-- product deactivation request only by opening Approvals, and the storekeeper never
-- heard the outcome. A trigger on approval_requests now sends:
--   new pending request   -> the branch's active managers (the Owner when the
--                            branch has none), never the requester
--   approved / rejected   -> the requester, unless they reviewed it themselves
-- New-member approvals keep their onboarding notifications and are skipped here.
-- The trigger only adds notifications; the approval RPCs are unchanged.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'payment_awaiting_acknowledgement', 'payment_awaiting_confirmation',
    'payment_confirmed', 'payment_declined',
    'onboarding_submitted', 'onboarding_approved', 'onboarding_rejected',
    'guarantor_completed',
    'stock_request_submitted', 'stock_request_approved',
    'stock_request_rejected', 'stock_request_fulfilled',
    'approval_requested', 'approval_approved', 'approval_rejected'
  ));

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_entity_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_entity_type_check
  CHECK (entity_type IN ('payment', 'customer_payment', 'onboarding', 'stock_request', 'approval_request'));

CREATE OR REPLACE FUNCTION app_private.notify_approval_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_what TEXT;
BEGIN
  IF NEW.type NOT IN ('stock_addition', 'product_deactivation') THEN RETURN NEW; END IF;

  v_what := CASE NEW.type
      WHEN 'stock_addition' THEN 'add ' || COALESCE(NEW.quantity::TEXT || ' units of ', '') || COALESCE(p.name, 'a product')
      ELSE 'deactivate ' || COALESCE(p.name, 'a product') END
    FROM (SELECT (SELECT name FROM public.products WHERE id = NEW.product_id) AS name) p;

  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
    SELECT NEW.tenant_id, u.id, 'approval_requested', 'approval_request', NEW.id::TEXT,
           app_private.full_name(NEW.requested_by) || ' asked to ' || v_what
           || CASE WHEN NEW.emergency THEN ' (emergency, already added)' ELSE '' END
      FROM public.users u
     WHERE u.tenant_id = NEW.tenant_id AND u.status = 'active' AND u.id <> NEW.requested_by
       AND (
         (u.role = 'manager' AND u.branch_id = NEW.branch_id)
         OR (u.role = 'owner' AND NOT EXISTS (
               SELECT 1 FROM public.users m
                WHERE m.tenant_id = NEW.tenant_id AND m.role = 'manager' AND m.status = 'active'
                  AND m.branch_id = NEW.branch_id))
       );
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected')
        AND NEW.reviewed_by IS DISTINCT FROM NEW.requested_by THEN
    INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
    VALUES (NEW.tenant_id, NEW.requested_by,
            CASE NEW.status WHEN 'approved' THEN 'approval_approved' ELSE 'approval_rejected' END,
            'approval_request', NEW.id::TEXT,
            COALESCE(app_private.full_name(NEW.reviewed_by), 'Your reviewer') || ' '
            || NEW.status || ' your request to ' || v_what
            || CASE WHEN NEW.status = 'rejected' AND NULLIF(TRIM(NEW.rejection_reason), '') IS NOT NULL
                    THEN ': ' || TRIM(NEW.rejection_reason) ELSE '' END);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.notify_approval_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_approval_change ON public.approval_requests;
CREATE TRIGGER notify_approval_change
  AFTER INSERT OR UPDATE OF status ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION app_private.notify_approval_change();
