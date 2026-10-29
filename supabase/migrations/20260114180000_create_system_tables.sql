-- Migration: Create System Tables
-- Created: 2026-01-14
-- Description: Onboarding, audit logs, and notifications

-- ============================================================================
-- ONBOARDINGS TABLE
-- ============================================================================
-- Staff onboarding workflow with guarantor verification

CREATE TABLE IF NOT EXISTS onboardings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  department TEXT NOT NULL,
  start_date DATE NOT NULL,
  -- Onboarding status
  status TEXT NOT NULL DEFAULT 'invited' 
    CHECK (status IN ('invited', 'in_progress', 'submitted', 'active')),
  -- Onboarding link token
  token TEXT UNIQUE NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  token_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  token_used BOOLEAN NOT NULL DEFAULT FALSE,
  -- Progress tracking
  step INTEGER NOT NULL DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{}', -- Employee form data
  password_set BOOLEAN NOT NULL DEFAULT FALSE,
  correction_note TEXT,
  -- Guarantor workflow
  guarantor_status TEXT NOT NULL DEFAULT 'not_sent' 
    CHECK (guarantor_status IN ('not_sent', 'sent', 'completed')),
  guarantor_token TEXT UNIQUE,
  guarantor_response JSONB,
  -- Owner review
  guarantor_decision TEXT CHECK (guarantor_decision IN ('accepted', 'declined')),
  guarantor_decision_reason TEXT,
  guarantor_decided_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE onboardings IS 'Staff onboarding workflow with guarantor verification';
COMMENT ON COLUMN onboardings.token IS 'Unique token for onboarding link (should be hashed in production)';
COMMENT ON COLUMN onboardings.data IS 'JSON containing all employee form fields';
COMMENT ON COLUMN onboardings.guarantor_response IS 'JSON containing guarantor form submission';

CREATE INDEX idx_onboardings_tenant ON onboardings(tenant_id);
CREATE INDEX idx_onboardings_user ON onboardings(user_id);
CREATE INDEX idx_onboardings_status ON onboardings(status);
CREATE INDEX idx_onboardings_token ON onboardings(token);
CREATE INDEX idx_onboardings_guarantor_token ON onboardings(guarantor_token);

-- ============================================================================
-- ONBOARDING FILES TABLE
-- ============================================================================
-- Cloudinary references for onboarding photos and documents

CREATE TABLE IF NOT EXISTS onboarding_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID NOT NULL REFERENCES onboardings(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL CHECK (file_type IN ('photo', 'credential')),
  file_name TEXT NOT NULL,
  cloudinary_public_id TEXT NOT NULL,
  cloudinary_url TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE onboarding_files IS 'File references for onboarding photos and credentials (stored in Cloudinary)';
COMMENT ON COLUMN onboarding_files.cloudinary_public_id IS 'Cloudinary public_id for fetching/deleting';
COMMENT ON COLUMN onboarding_files.cloudinary_url IS 'Secure URL to access file';

CREATE INDEX idx_onboarding_files_onboarding ON onboarding_files(onboarding_id);
CREATE INDEX idx_onboarding_files_type ON onboarding_files(file_type);

-- ============================================================================
-- ACTIVITIES TABLE (Audit Log)
-- ============================================================================
-- Immutable audit trail of all system actions

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  subject TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entity TEXT NOT NULL 
    CHECK (entity IN (
      'product', 'sale', 'payment', 'expense', 'remittance', 
      'stock_request', 'target', 'team_member', 'branch', 
      'inventory', 'settings', 'session', 'customer'
    )),
  entity_id TEXT,
  emergency BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE activities IS 'Immutable audit trail of all system actions';
COMMENT ON COLUMN activities.action IS 'Human-readable action description';
COMMENT ON COLUMN activities.subject IS 'Detailed description including entity identifier';
COMMENT ON COLUMN activities.metadata IS 'Additional context (amounts, IDs, reasons, etc.)';

CREATE INDEX idx_activities_tenant ON activities(tenant_id);
CREATE INDEX idx_activities_actor ON activities(actor_id);
CREATE INDEX idx_activities_entity ON activities(entity, entity_id);
CREATE INDEX idx_activities_date ON activities(created_at DESC);
CREATE INDEX idx_activities_emergency ON activities(emergency) WHERE emergency = true;

-- ============================================================================
-- NOTIFICATIONS TABLE
-- ============================================================================
-- In-app notifications for users

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL 
    CHECK (type IN (
      'payment_awaiting_acknowledgement',
      'payment_awaiting_confirmation',
      'payment_confirmed',
      'payment_declined',
      'onboarding_submitted',
      'guarantor_completed',
      'stock_request_submitted',
      'stock_request_approved',
      'stock_request_rejected',
      'stock_request_fulfilled'
    )),
  entity_type TEXT NOT NULL 
    CHECK (entity_type IN ('payment', 'customer_payment', 'onboarding', 'stock_request')),
  entity_id TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notifications IS 'In-app notifications for users';
COMMENT ON COLUMN notifications.type IS 'Notification type determining icon and action';
COMMENT ON COLUMN notifications.entity_type IS 'Type of entity this notification references';
COMMENT ON COLUMN notifications.entity_id IS 'ID of the referenced entity';

CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX idx_notifications_read ON notifications(read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX idx_notifications_entity ON notifications(entity_type, entity_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to create an audit log entry
CREATE OR REPLACE FUNCTION create_audit_log(
  p_tenant_id UUID,
  p_actor_id UUID,
  p_action TEXT,
  p_subject TEXT,
  p_entity TEXT,
  p_entity_id TEXT DEFAULT NULL,
  p_emergency BOOLEAN DEFAULT FALSE,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO activities (
    tenant_id, actor_id, action, subject, entity, entity_id, emergency, metadata
  ) VALUES (
    p_tenant_id, p_actor_id, p_action, p_subject, p_entity, p_entity_id, p_emergency, p_metadata
  )
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_audit_log IS 'Creates an audit log entry and returns the ID';

-- Function to create a notification
CREATE OR REPLACE FUNCTION create_notification(
  p_tenant_id UUID,
  p_recipient_id UUID,
  p_type TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_message TEXT
)
RETURNS UUID AS $$
DECLARE
  notif_id UUID;
BEGIN
  INSERT INTO notifications (
    tenant_id, recipient_id, type, entity_type, entity_id, message
  ) VALUES (
    p_tenant_id, p_recipient_id, p_type, p_entity_type, p_entity_id, p_message
  )
  RETURNING id INTO notif_id;
  
  RETURN notif_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_notification IS 'Creates a notification and returns the ID';

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE notifications
  SET read_at = NOW()
  WHERE id = p_notification_id
    AND read_at IS NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_notification_read IS 'Marks a notification as read';

-- Function to get unread notification count for a user
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM notifications
  WHERE recipient_id = p_user_id
    AND read_at IS NULL;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_unread_notification_count IS 'Returns count of unread notifications for a user';

-- ============================================================================
-- APPLY TRIGGERS
-- ============================================================================

CREATE TRIGGER update_onboardings_updated_at
  BEFORE UPDATE ON onboardings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
