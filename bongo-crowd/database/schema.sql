-- BONGO-CROWD Database Schema
-- Full-featured bug bounty platform

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    google_id VARCHAR(255) UNIQUE,
    avatar_url VARCHAR(500),
    display_name VARCHAR(100),
    bio TEXT,
    location VARCHAR(100),
    website VARCHAR(255),
    twitter VARCHAR(100),
    github VARCHAR(100),
    role VARCHAR(20) DEFAULT 'hacker' CHECK (role IN ('hacker', 'company', 'admin')),
    reputation INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    total_earnings DECIMAL(12,2) DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    is_banned BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Site settings table
CREATE TABLE site_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    site_name VARCHAR(100) DEFAULT 'BONGO-CROWD',
    site_logo VARCHAR(500),
    site_description TEXT,
    maintenance_mode BOOLEAN DEFAULT FALSE,
    maintenance_message TEXT DEFAULT 'Site is under maintenance. Please check back later.',
    allow_signups BOOLEAN DEFAULT TRUE,
    require_email_verification BOOLEAN DEFAULT TRUE,
    default_currency VARCHAR(3) DEFAULT 'USD',
    min_bounty_amount DECIMAL(10,2) DEFAULT 50,
    platform_fee_percent DECIMAL(5,2) DEFAULT 10,
    contact_email VARCHAR(255),
    support_email VARCHAR(255),
    social_twitter VARCHAR(255),
    social_linkedin VARCHAR(255),
    social_telegram VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Companies table
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    logo_url VARCHAR(500),
    website VARCHAR(255),
    industry VARCHAR(100),
    size VARCHAR(50),
    location VARCHAR(100),
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    admin_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Programs table (Bug bounty programs)
CREATE TABLE programs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    short_description VARCHAR(500),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'closed')),
    
    -- Scope
    in_scope_domains TEXT[],
    out_of_scope_domains TEXT[],
    
    -- Rewards
    min_reward DECIMAL(10,2) DEFAULT 0,
    max_reward DECIMAL(10,2),
    average_reward DECIMAL(10,2),
    
    -- Reward breakdown by severity
    critical_reward_min DECIMAL(10,2),
    critical_reward_max DECIMAL(10,2),
    high_reward_min DECIMAL(10,2),
    high_reward_max DECIMAL(10,2),
    medium_reward_min DECIMAL(10,2),
    medium_reward_max DECIMAL(10,2),
    low_reward_min DECIMAL(10,2),
    low_reward_max DECIMAL(10,2),
    
    -- Program settings
    response_time_hours INTEGER DEFAULT 72,
    bounty_time_days INTEGER DEFAULT 30,
    safe_harbor BOOLEAN DEFAULT TRUE,
    allows_disclosure BOOLEAN DEFAULT TRUE,
    
    -- Stats
    total_reports INTEGER DEFAULT 0,
    resolved_reports INTEGER DEFAULT 0,
    average_bounty DECIMAL(10,2) DEFAULT 0,
    total_paid DECIMAL(12,2) DEFAULT 0,
    
    -- Content
    policy TEXT,
    scope_details TEXT,
    out_of_scope TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reports table (Vulnerability reports)
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id VARCHAR(20) UNIQUE NOT NULL,
    program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
    researcher_id UUID REFERENCES users(id),
    
    -- Report details
    title VARCHAR(300) NOT NULL,
    vulnerability_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    cvss_score DECIMAL(3,1),
    
    -- Content
    description TEXT NOT NULL,
    impact TEXT NOT NULL,
    reproduction_steps TEXT NOT NULL,
    proof_of_concept TEXT,
    attachments JSONB DEFAULT '[]',
    
    -- Status workflow
    status VARCHAR(30) DEFAULT 'submitted' CHECK (status IN (
        'submitted', 'triaged', 'needs_info', 'accepted', 'duplicate', 
        'not_applicable', 'informative', 'resolved', 'closed'
    )),
    
    -- Timestamps
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    triaged_at TIMESTAMP,
    accepted_at TIMESTAMP,
    resolved_at TIMESTAMP,
    closed_at TIMESTAMP,
    
    -- Bounty
    bounty_amount DECIMAL(10,2),
    bounty_paid BOOLEAN DEFAULT FALSE,
    bounty_paid_at TIMESTAMP,
    
    -- Disclosure
    disclosure_allowed BOOLEAN DEFAULT FALSE,
    disclosed_at TIMESTAMP,
    disclosure_title VARCHAR(300),
    disclosure_content TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Report comments/activity
CREATE TABLE report_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Leaderboard entries
CREATE TABLE leaderboard_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    period VARCHAR(20) NOT NULL CHECK (period IN ('all_time', 'year', 'month', 'week')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    points INTEGER DEFAULT 0,
    reports_submitted INTEGER DEFAULT 0,
    reports_accepted INTEGER DEFAULT 0,
    critical_findings INTEGER DEFAULT 0,
    high_findings INTEGER DEFAULT 0,
    medium_findings INTEGER DEFAULT 0,
    low_findings INTEGER DEFAULT 0,
    total_earnings DECIMAL(12,2) DEFAULT 0,
    UNIQUE(user_id, period, period_start)
);

-- Badges/Achievements
CREATE TABLE badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url VARCHAR(500),
    criteria_type VARCHAR(50),
    criteria_value INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User badges
CREATE TABLE user_badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    badge_id UUID REFERENCES badges(id) ON DELETE CASCADE,
    awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, badge_id)
);

-- Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    link VARCHAR(500),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session tokens
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activity log
CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email verifications
CREATE TABLE email_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Password resets
CREATE TABLE password_resets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_programs_status ON programs(status);
CREATE INDEX idx_programs_company ON programs(company_id);
CREATE INDEX idx_reports_researcher ON reports(researcher_id);
CREATE INDEX idx_reports_program ON reports(program_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_severity ON reports(severity);
CREATE INDEX idx_leaderboard_period ON leaderboard_entries(period, period_start, period_end);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- Insert default site settings
INSERT INTO site_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Insert sample badges
INSERT INTO badges (name, description, icon_url, criteria_type, criteria_value) VALUES
('First Blood', 'Submit your first valid vulnerability report', '🔥', 'reports', 1),
('Critical Hunter', 'Find 5 critical severity vulnerabilities', '💀', 'critical', 5),
('Bug Squasher', 'Have 10 reports marked as resolved', '🔨', 'resolved', 10),
('Elite Hacker', 'Reach 10,000 reputation points', '👑', 'reputation', 10000),
('Rising Star', 'Submit 5 reports in your first month', '⭐', 'first_month_reports', 5);
