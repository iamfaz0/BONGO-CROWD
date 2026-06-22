-- BONGO-CROWD Analytics Database Schema
-- Materialized views and analytics tables for dashboard

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Analytics metrics tracking table (for historical data)
CREATE TABLE analytics_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_type VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50), -- 'platform', 'company', 'program', 'user'
    entity_id UUID,
    value DECIMAL(15,2) NOT NULL,
    value_int INTEGER,
    value_json JSONB,
    period VARCHAR(20), -- 'daily', 'weekly', 'monthly', 'yearly'
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(metric_type, metric_name, entity_type, entity_id, period, period_start)
);

-- Materialized view: Platform Overview Statistics
CREATE MATERIALIZED VIEW mv_platform_stats AS
SELECT
    COUNT(DISTINCT r.id) as total_reports,
    COUNT(DISTINCT CASE WHEN r.status = 'accepted' THEN r.id END) as accepted_reports,
    COUNT(DISTINCT CASE WHEN r.status = 'resolved' THEN r.id END) as resolved_reports,
    COUNT(DISTINCT CASE WHEN r.bounty_paid = true THEN r.id END) as paid_reports,
    COALESCE(SUM(r.bounty_amount), 0) as total_bounties_paid,
    COUNT(DISTINCT r.researcher_id) as unique_researchers,
    COUNT(DISTINCT p.id) as total_programs,
    COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) as active_programs,
    COUNT(DISTINCT c.id) as total_companies,
    COUNT(DISTINCT CASE WHEN r.severity = 'critical' THEN r.id END) as critical_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'high' THEN r.id END) as high_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'medium' THEN r.id END) as medium_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'low' THEN r.id END) as low_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'info' THEN r.id END) as info_count,
    AVG(CASE WHEN r.bounty_amount > 0 THEN r.bounty_amount END) as avg_bounty_amount,
    NOW() as refreshed_at
FROM reports r
LEFT JOIN programs p ON r.program_id = p.id
LEFT JOIN companies c ON p.company_id = c.id;

-- Create index on materialized view
CREATE UNIQUE INDEX idx_mv_platform_stats ON mv_platform_stats(refreshed_at);

-- Materialized view: Daily Submissions Trend
CREATE MATERIALIZED VIEW mv_daily_submissions AS
SELECT
    DATE(r.submitted_at) as submission_date,
    COUNT(*) as submission_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'critical' THEN r.id END) as critical_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'high' THEN r.id END) as high_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'medium' THEN r.id END) as medium_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'low' THEN r.id END) as low_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'info' THEN r.id END) as info_count,
    COALESCE(SUM(r.bounty_amount), 0) as bounty_total,
    NOW() as refreshed_at
FROM reports r
GROUP BY DATE(r.submitted_at)
ORDER BY submission_date DESC;

CREATE UNIQUE INDEX idx_mv_daily_submissions ON mv_daily_submissions(submission_date);

-- Materialized view: Monthly Analytics
CREATE MATERIALIZED VIEW mv_monthly_analytics AS
SELECT
    DATE_TRUNC('month', r.submitted_at) as month_start,
    COUNT(*) as total_reports,
    COUNT(DISTINCT CASE WHEN r.status IN ('accepted', 'resolved') THEN r.id END) as valid_reports,
    COUNT(DISTINCT CASE WHEN r.bounty_paid = true THEN r.id END) as paid_reports,
    COALESCE(SUM(r.bounty_amount), 0) as total_bounties,
    AVG(CASE WHEN r.bounty_amount > 0 THEN r.bounty_amount END) as avg_bounty,
    COUNT(DISTINCT r.researcher_id) as active_researchers,
    COUNT(DISTINCT r.program_id) as active_programs,
    EXTRACT(EPOCH FROM (r.resolved_at - r.submitted_at))/3600 as avg_resolution_hours,
    NOW() as refreshed_at
FROM reports r
GROUP BY DATE_TRUNC('month', r.submitted_at), EXTRACT(EPOCH FROM (r.resolved_at - r.submitted_at))/3600
ORDER BY month_start DESC;

CREATE UNIQUE INDEX idx_mv_monthly_analytics ON mv_monthly_analytics(month_start);

-- Materialized view: Company Analytics
CREATE MATERIALIZED VIEW mv_company_analytics AS
SELECT
    c.id as company_id,
    c.name as company_name,
    c.slug as company_slug,
    COUNT(DISTINCT r.id) as total_reports,
    COUNT(DISTINCT CASE WHEN r.status = 'submitted' THEN r.id END) as pending_reports,
    COUNT(DISTINCT CASE WHEN r.status = 'triaged' THEN r.id END) as triaged_reports,
    COUNT(DISTINCT CASE WHEN r.status IN ('accepted', 'resolved') THEN r.id END) as accepted_reports,
    COUNT(DISTINCT CASE WHEN r.status = 'resolved' THEN r.id END) as resolved_reports,
    COUNT(DISTINCT CASE WHEN r.severity = 'critical' THEN r.id END) as critical_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'high' THEN r.id END) as high_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'medium' THEN r.id END) as medium_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'low' THEN r.id END) as low_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'info' THEN r.id END) as info_count,
    COALESCE(SUM(r.bounty_amount), 0) as total_bounties_paid,
    AVG(CASE WHEN r.bounty_amount > 0 THEN r.bounty_amount END) as avg_bounty,
    COUNT(DISTINCT r.researcher_id) as unique_researchers,
    COUNT(DISTINCT p.id) as total_programs,
    COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) as active_programs,
    MIN(r.submitted_at) as first_report_date,
    MAX(r.submitted_at) as latest_report_date,
    AVG(EXTRACT(EPOCH FROM (COALESCE(r.triaged_at, r.submitted_at) - r.submitted_at))/3600) as avg_triage_hours,
    AVG(EXTRACT(EPOCH FROM (COALESCE(r.resolved_at, r.accepted_at) - r.submitted_at))/3600) as avg_resolution_hours,
    NOW() as refreshed_at
FROM companies c
LEFT JOIN programs p ON c.id = p.company_id
LEFT JOIN reports r ON p.id = r.program_id
GROUP BY c.id, c.name, c.slug;

CREATE UNIQUE INDEX idx_mv_company_analytics ON mv_company_analytics(company_id);

-- Materialized view: Vulnerability Types Breakdown
CREATE MATERIALIZED VIEW mv_vulnerability_types AS
SELECT
    r.vulnerability_type,
    COUNT(*) as total_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'critical' THEN r.id END) as critical_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'high' THEN r.id END) as high_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'medium' THEN r.id END) as medium_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'low' THEN r.id END) as low_count,
    AVG(CASE WHEN r.bounty_amount > 0 THEN r.bounty_amount END) as avg_bounty,
    NOW() as refreshed_at
FROM reports r
WHERE r.vulnerability_type IS NOT NULL
GROUP BY r.vulnerability_type
ORDER BY total_count DESC;

CREATE UNIQUE INDEX idx_mv_vulnerability_types ON mv_vulnerability_types(vulnerability_type);

-- Materialized view: Researcher Leaderboard (All Time)
CREATE MATERIALIZED VIEW mv_researcher_leaderboard AS
SELECT
    u.id as researcher_id,
    u.username,
    u.display_name,
    u.avatar_url,
    COUNT(DISTINCT r.id) as total_reports,
    COUNT(DISTINCT CASE WHEN r.status IN ('accepted', 'resolved') THEN r.id END) as accepted_reports,
    COUNT(DISTINCT CASE WHEN r.severity = 'critical' THEN r.id END) as critical_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'high' THEN r.id END) as high_count,
    COUNT(DISTINCT CASE WHEN r.severity = 'medium' THEN r.id END) as medium_count,
    COALESCE(SUM(r.bounty_amount), 0) as total_earnings,
    AVG(CASE WHEN r.bounty_amount > 0 THEN r.bounty_amount END) as avg_bounty,
    MAX(r.submitted_at) as last_submission,
    NOW() as refreshed_at
FROM users u
LEFT JOIN reports r ON u.id = r.researcher_id
WHERE u.role = 'hacker' AND r.id IS NOT NULL
GROUP BY u.id, u.username, u.display_name, u.avatar_url
ORDER BY total_earnings DESC, accepted_reports DESC;

CREATE UNIQUE INDEX idx_mv_researcher_leaderboard ON mv_researcher_leaderboard(researcher_id);

-- Materialized view: Response Time Metrics
CREATE MATERIALIZED VIEW mv_response_time_metrics AS
SELECT
    DATE_TRUNC('month', r.submitted_at) as month,
    AVG(EXTRACT(EPOCH FROM (r.triaged_at - r.submitted_at))/3600) as avg_triage_hours,
    AVG(EXTRACT(EPOCH FROM (r.accepted_at - r.submitted_at))/3600) as avg_accept_hours,
    AVG(EXTRACT(EPOCH FROM (r.resolved_at - r.submitted_at))/3600) as avg_resolution_hours,
    AVG(EXTRACT(EPOCH FROM (r.bounty_paid_at - r.accepted_at))/3600) as avg_bounty_payment_hours,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r.triaged_at - r.submitted_at))/3600) as median_triage_hours,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r.resolved_at - r.submitted_at))/3600) as median_resolution_hours,
    COUNT(*) as total_reports,
    NOW() as refreshed_at
FROM reports r
WHERE r.triaged_at IS NOT NULL OR r.resolved_at IS NOT NULL
GROUP BY DATE_TRUNC('month', r.submitted_at)
ORDER BY month DESC;

CREATE UNIQUE INDEX idx_mv_response_time_metrics ON mv_response_time_metrics(month);

-- Function to refresh all analytics materialized views
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_platform_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_submissions;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_analytics;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_company_analytics;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_vulnerability_types;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_researcher_leaderboard;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_response_time_metrics;
END;
$$;

-- Create indexes for analytics queries
CREATE INDEX idx_analytics_metrics_type ON analytics_metrics(metric_type, metric_name);
CREATE INDEX idx_analytics_metrics_entity ON analytics_metrics(entity_type, entity_id);
CREATE INDEX idx_analytics_metrics_period ON analytics_metrics(period, period_start);

-- Indexes for report analytics
CREATE INDEX idx_reports_submitted_date ON reports(DATE(submitted_at));
CREATE INDEX idx_reports_bounty_paid ON reports(bounty_paid, bounty_paid_at);
CREATE INDEX idx_reports_severity_status ON reports(severity, status);

-- Function to track daily metrics
CREATE OR REPLACE FUNCTION track_daily_metrics()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    today_date DATE := CURRENT_DATE;
BEGIN
    -- Platform daily metrics
    INSERT INTO analytics_metrics (metric_type, metric_name, entity_type, value, value_int, period, period_start, period_end)
    SELECT
        'submission',
        'daily_count',
        'platform',
        COUNT(*)::DECIMAL,
        COUNT(*)::INTEGER,
        'daily',
        today_date,
        today_date
    FROM reports
    WHERE DATE(submitted_at) = today_date
    ON CONFLICT (metric_type, metric_name, entity_type, entity_id, period, period_start)
    DO UPDATE SET value = EXCLUDED.value, value_int = EXCLUDED.value_int;

    -- Platform daily bounties
    INSERT INTO analytics_metrics (metric_type, metric_name, entity_type, value, value_int, period, period_start, period_end)
    SELECT
        'bounty',
        'daily_total',
        'platform',
        COALESCE(SUM(bounty_amount), 0),
        NULL,
        'daily',
        today_date,
        today_date
    FROM reports
    WHERE DATE(bounty_paid_at) = today_date
    ON CONFLICT (metric_type, metric_name, entity_type, entity_id, period, period_start)
    DO UPDATE SET value = EXCLUDED.value;
END;
$$;
