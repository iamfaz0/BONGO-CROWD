-- Report Review Workflow Migration
-- Adds admin review, bounty assignment, and report status tracking

-- Update reports table with review fields
ALTER TABLE reports ADD COLUMN IF NOT EXISTS bounty_amount INTEGER DEFAULT NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS bounty_currency VARCHAR(10) DEFAULT 'TZS';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP DEFAULT NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS admin_notes TEXT DEFAULT NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS severity VARCHAR(50) DEFAULT NULL; -- critical, high, medium, low
ALTER TABLE reports ADD COLUMN IF NOT EXISTS cvss_score DECIMAL(3,1) DEFAULT NULL; -- CVSS score 0.0-10.0

-- Add report status enum (if not exists)
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE reports ADD CONSTRAINT reports_status_check 
    CHECK (status IN ('pending', 'under_review', 'accepted', 'rejected', 'duplicate', 'informative', 'resolved', 'closed'));

-- Create report comments table for admin-researcher communication
CREATE TABLE IF NOT EXISTS report_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE, -- TRUE for admin-only comments
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_report_comments_report_id ON report_comments(report_id);

-- Create bounty history table for tracking changes
CREATE TABLE IF NOT EXISTS bounty_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    currency VARCHAR(10) DEFAULT 'TZS',
    action VARCHAR(50) NOT NULL, -- awarded, modified, revoked
    reason TEXT,
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bounty_history_report_id ON bounty_history(report_id);

-- Create report activity log
CREATE TABLE IF NOT EXISTS report_activity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_report_activity_report_id ON report_activity(report_id);

-- Function to log report activity
CREATE OR REPLACE FUNCTION log_report_activity()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO report_activity (report_id, action, performed_by, details)
    VALUES (
        NEW.id,
        'status_changed',
        NEW.reviewed_by,
        jsonb_build_object(
            'old_status', OLD.status,
            'new_status', NEW.status,
            'bounty', NEW.bounty_amount
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for status changes
DROP TRIGGER IF EXISTS trigger_report_activity ON reports;
CREATE TRIGGER trigger_report_activity
AFTER UPDATE OF status ON reports
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION log_report_activity();

-- Function to award bounty
CREATE OR REPLACE FUNCTION award_report_bounty(
    p_report_id UUID,
    p_amount INTEGER,
    p_admin_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_reporter_id UUID;
    v_report_title TEXT;
    v_payment_id UUID;
BEGIN
    -- Get report details
    SELECT reporter_id, title INTO v_reporter_id, v_report_title
    FROM reports WHERE id = p_report_id;
    
    -- Update report
    UPDATE reports SET
        bounty_amount = p_amount,
        status = 'accepted',
        reviewed_by = p_admin_id,
        reviewed_at = CURRENT_TIMESTAMP,
        admin_notes = COALESCE(admin_notes || E'\n\n' || p_notes, p_notes)
    WHERE id = p_report_id;
    
    -- Log bounty history
    INSERT INTO bounty_history (report_id, amount, action, reason, admin_id)
    VALUES (p_report_id, p_amount, 'awarded', p_notes, p_admin_id);
    
    -- Create payment record for withdrawal
    INSERT INTO payments (user_id, type, amount, reference, status, metadata)
    VALUES (
        v_reporter_id,
        'withdrawal',
        p_amount,
        'BOUNTY_' || p_report_id::text,
        'pending',
        jsonb_build_object(
            'report_id', p_report_id,
            'report_title', v_report_title,
            'awarded_by', p_admin_id
        )
    )
    RETURNING id INTO v_payment_id;
    
    -- Update report with payment reference
    UPDATE reports SET payment_id = v_payment_id WHERE id = p_report_id;
    
    -- Update user wallet
    INSERT INTO user_wallets (user_id, total_earned)
    VALUES (v_reporter_id, p_amount)
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        total_earned = user_wallets.total_earned + p_amount,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function to reject report
CREATE OR REPLACE FUNCTION reject_report(
    p_report_id UUID,
    p_reason TEXT,
    p_admin_id UUID,
    p_rejection_type VARCHAR(50) DEFAULT 'rejected' -- rejected, duplicate, informative
)
RETURNS VOID AS $$
BEGIN
    UPDATE reports SET
        status = p_rejection_type,
        reviewed_by = p_admin_id,
        reviewed_at = CURRENT_TIMESTAMP,
        admin_notes = COALESCE(admin_notes || E'\n\nRejection Reason: ' || p_reason, 'Rejection Reason: ' || p_reason)
    WHERE id = p_report_id;
    
    -- Log activity
    INSERT INTO report_activity (report_id, action, performed_by, details)
    VALUES (p_report_id, 'report_rejected', p_admin_id, jsonb_build_object('reason', p_reason, 'type', p_rejection_type));
END;
$$ LANGUAGE plpgsql;

SELECT 'Report review workflow tables and functions created successfully' as status;
