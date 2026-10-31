-- RESET BUSINESS DATA. Destructive and permanent. Not a migration: run it by
-- hand in the Supabase SQL Editor, only when you mean to start over.
--
-- Keeps: the business (tenants), its branches, and the Owner account(s) with
--        their sign-in and settings.
-- Clears: every other staff account (sign-in included), onboardings and their
--         file records, products, stock, stock requests, customers, sales,
--         payments, expenses, remittances, targets, approvals, notifications
--         and the audit log. Request numbers start again (SR-1001, ...).
--
-- It runs as one transaction: if any statement fails, nothing is changed.
-- Uploaded onboarding files stay in Storage; empty the onboarding-files bucket
-- from the dashboard (Storage) afterwards.
BEGIN;

-- Refuse to run without an active Owner, so it can never remove every account.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE role = 'owner' AND status = 'active') THEN
    RAISE EXCEPTION 'Reset aborted: no active Owner account found.';
  END IF;
END $$;

-- One TRUNCATE for the whole set. Without CASCADE it fails (and changes
-- nothing) if any table outside this list still points at these rows.
TRUNCATE TABLE
  public.notifications,
  public.activities,
  public.approval_requests,
  public.stock_requests,
  public.customer_payments,
  public.payments,
  public.sales,
  public.expenses,
  public.manager_remittances,
  public.owner_remittances,
  public.targets,
  public.inventory_movements,
  public.stock_batches,
  public.inventory_records,
  public.customers,
  public.products,
  public.onboarding_files,
  public.onboardings,
  app_private.rpc_requests;

-- Staff sign-ins. Deleting the auth account removes the profile (users.id
-- cascades) and its preferences; branches.manager_id is cleared.
DELETE FROM auth.users
WHERE id NOT IN (SELECT id FROM public.users WHERE role = 'owner');

ALTER SEQUENCE app_private.stock_request_seq RESTART WITH 1001;
ALTER SEQUENCE app_private.payment_seq RESTART WITH 3001;
ALTER SEQUENCE app_private.expense_seq RESTART WITH 4201;
ALTER SEQUENCE app_private.owner_remittance_seq RESTART WITH 5001;

COMMIT;

-- What is left (expect: owners only, your branches, zeros elsewhere).
SELECT
  (SELECT count(*) FROM public.users)                            AS users,
  (SELECT count(*) FROM public.users WHERE role = 'owner')       AS owners,
  (SELECT count(*) FROM auth.users)                              AS sign_in_accounts,
  (SELECT count(*) FROM public.branches)                         AS branches,
  (SELECT count(*) FROM public.products)                         AS products,
  (SELECT count(*) FROM public.customers)                        AS customers,
  (SELECT count(*) FROM public.targets)                          AS targets,
  (SELECT count(*) FROM public.notifications)                    AS notifications,
  (SELECT count(*) FROM public.stock_requests)                   AS stock_requests,
  (SELECT count(*) FROM public.sales)                            AS sales,
  (SELECT count(*) FROM public.onboardings)                      AS onboardings;
