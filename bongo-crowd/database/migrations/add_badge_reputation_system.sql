-- BONGO-CROWD Badge and Reputation System Migration
-- Adds comprehensive gamification features for hackers

-- ============================================
-- 1. UPDATE EXISTING USERS TABLE
-- ============================================
-- Add reputation_score column if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'reputation_score') THEN
        ALTER TABLE users ADD COLUMN reputation_score INTEGER DEFAULT 0;
    END IF;
END $$;

-- Ensure reputation column exists (may already exist from schema)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'reputation') THEN
        ALTER TABLE users ADD COLUMN reputation INTEGER DEFAULT 0;
    END IF;
END $$;

-- ============================================
-- 2. BADGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    icon VARCHAR(50) NOT NULL DEFAULT '🏆',
    criteria JSONB NOT NULL DEFAULT '{}',
    category VARCHAR(50) NOT NULL DEFAULT 'achievement' 
        CHECK (category IN ('skill', 'achievement', 'activity', 'special')),
    rarity VARCHAR(20) NOT NULL DEFAULT 'common' 
        CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
    points_reward INTEGER DEFAULT 0,
    color VARCHAR(20) DEFAULT '#7c3aed',
    gradient_start VARCHAR(20) DEFAULT '#7c3aed',
    gradient_end VARCHAR(20) DEFAULT '#06b6d4',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. USER BADGES TABLE (Many-to-Many)
-- ============================================
CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notification_sent BOOLEAN DEFAULT FALSE,
    UNIQUE(user_id, badge_id)
);

-- ============================================
-- 4. USER REPUTATION TABLE (Detailed Tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS user_reputation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    rank VARCHAR(20) DEFAULT 'novice' 
        CHECK (rank IN ('novice', 'hunter', 'expert', 'elite', 'legend')),
    streak_current INTEGER DEFAULT 0,
    streak_longest INTEGER DEFAULT 0,
    last_activity_at TIMESTAMP,
    valid_reports_count INTEGER DEFAULT 0,
    critical_findings INTEGER DEFAULT 0,
    high_findings INTEGER DEFAULT 0,
    medium_findings INTEGER DEFAULT 0,
    low_findings INTEGER DEFAULT 0,
    total_bounties_earned DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- ============================================
-- 5. REPUTATION HISTORY TABLE (Audit Trail)
-- ============================================
CREATE TABLE IF NOT EXISTS reputation_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    points_change INTEGER NOT NULL,
    points_before INTEGER NOT NULL,
    points_after INTEGER NOT NULL,
    reference_type VARCHAR(50), -- 'report', 'badge', 'streak', etc.
    reference_id UUID,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 6. STREAK TRACKING TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_streaks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    streak_type VARCHAR(50) NOT NULL DEFAULT 'activity' 
        CHECK (streak_type IN ('activity', 'reports', 'valid_reports')),
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity_date DATE,
    streak_start_date DATE,
    UNIQUE(user_id, streak_type)
);

-- ============================================
-- 7. INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_badges_category ON badges(category);
CREATE INDEX IF NOT EXISTS idx_badges_rarity ON badges(rarity);
CREATE INDEX IF NOT EXISTS idx_badges_is_active ON badges(is_active);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id ON user_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_earned_at ON user_badges(earned_at);

CREATE INDEX IF NOT EXISTS idx_user_reputation_score ON user_reputation(score DESC);
CREATE INDEX IF NOT EXISTS idx_user_reputation_rank ON user_reputation(rank);

CREATE INDEX IF NOT EXISTS idx_reputation_history_user_id ON reputation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_reputation_history_created_at ON reputation_history(created_at);

CREATE INDEX IF NOT EXISTS idx_user_streaks_user_id ON user_streaks(user_id);

-- ============================================
-- 8. SEED BADGES DATA
-- ============================================

-- Skill Badges
INSERT INTO badges (name, description, icon, criteria, category, rarity, points_reward, color, gradient_start, gradient_end) VALUES
('Web Hacker', 'Found 10+ valid web application vulnerabilities', '🔓', '{"type": "web_vulns", "count": 10}', 'skill', 'rare', 100, '#7c3aed', '#7c3aed', '#a855f7'),
('API Hunter', 'Found 5+ valid API vulnerabilities', '🔌', '{"type": "api_vulns", "count": 5}', 'skill', 'rare', 150, '#06b6d4', '#06b6d4', '#22d3ee'),
('Mobile Expert', 'Found 3+ valid mobile app vulnerabilities', '📱', '{"type": "mobile_vulns", "count": 3}', 'skill', 'epic', 200, '#8b5cf6', '#8b5cf6', '#a78bfa'),
('Blockchain Pro', 'Found 2+ valid smart contract vulnerabilities', '⛓️', '{"type": "blockchain_vulns", "count": 2}', 'skill', 'legendary', 500, '#f59e0b', '#f59e0b', '#fbbf24')
ON CONFLICT (name) DO NOTHING;

-- Achievement Badges
INSERT INTO badges (name, description, icon, criteria, category, rarity, points_reward, color, gradient_start, gradient_end) VALUES
('First Blood', 'Submitted your first valid vulnerability report', '🩸', '{"type": "first_report", "count": 1}', 'achievement', 'common', 50, '#10b981', '#10b981', '#34d399'),
('Bug Squasher', 'Had 10 reports marked as resolved', '🔨', '{"type": "resolved_reports", "count": 10}', 'achievement', 'rare', 100, '#ef4444', '#ef4444', '#f87171'),
('Critical Hunter', 'Found 5 critical severity vulnerabilities', '💀', '{"type": "critical_reports", "count": 5}', 'achievement', 'epic', 300, '#dc2626', '#dc2626', '#ef4444'),
('Elite Hunter', 'Reached 5,000 reputation points', '👑', '{"type": "reputation", "count": 5000}', 'achievement', 'legendary', 1000, '#fbbf24', '#fbbf24', '#f59e0b'),
('Hall of Fame', 'Ranked in top 10 of monthly leaderboard', '🏆', '{"type": "leaderboard_top10", "count": 1}', 'achievement', 'epic', 250, '#ec4899', '#ec4899', '#f472b6')
ON CONFLICT (name) DO NOTHING;

-- Activity Badges
INSERT INTO badges (name, description, icon, criteria, category, rarity, points_reward, color, gradient_start, gradient_end) VALUES
('Consistent Reporter', 'Submitted reports for 7 consecutive days', '📅', '{"type": "daily_streak", "count": 7}', 'activity', 'rare', 75, '#3b82f6', '#3b82f6', '#60a5fa'),
('Quick Responder', 'Responded to all triage requests within 24h', '⚡', '{"type": "quick_response", "count": 10}', 'activity', 'rare', 50, '#f59e0b', '#f59e0b', '#fbbf24'),
('Rising Star', 'Submitted 5 reports in your first month', '⭐', '{"type": "first_month_reports", "count": 5}', 'activity', 'common', 25, '#8b5cf6', '#8b5cf6', '#a78bfa'),
('Dedicated Hunter', 'Active for 30 consecutive days', '🔥', '{"type": "activity_streak", "count": 30}', 'activity', 'epic', 200, '#ef4444', '#ef4444', '#f87171')
ON CONFLICT (name) DO NOTHING;

-- Special Badges
INSERT INTO badges (name, description, icon, criteria, category, rarity, points_reward, color, gradient_start, gradient_end) VALUES
('Bug Bounty Pioneer', 'Joined during platform beta', '🚀', '{"type": "beta_user", "count": 1}', 'special', 'legendary', 500, '#14b8a6', '#14b8a6', '#2dd4bf'),
('Community Helper', 'Helped 5+ other researchers', '🤝', '{"type": "community_help", "count": 5}', 'special', 'rare', 100, '#22c55e', '#22c55e', '#4ade80'),
('Perfect Report', 'Submitted a report with CVSS 10.0', '💯', '{"type": "perfect_cvss", "count": 1}', 'special', 'epic', 400, '#f43f5e', '#f43f5e', '#fb7185')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 9. TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_badges_updated_at ON badges;
CREATE TRIGGER update_badges_updated_at
    BEFORE UPDATE ON badges
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_reputation_updated_at ON user_reputation;
CREATE TRIGGER update_user_reputation_updated_at
    BEFORE UPDATE ON user_reputation
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 10. INITIALIZE EXISTING USERS
-- ============================================
-- Create reputation entries for existing users
INSERT INTO user_reputation (user_id, score, rank, last_activity_at)
SELECT id, COALESCE(reputation, 0), 'novice', CURRENT_TIMESTAMP
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM user_reputation ur WHERE ur.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

-- Initialize streak tracking for existing users
INSERT INTO user_streaks (user_id, streak_type, current_streak, longest_streak, last_activity_date, streak_start_date)
SELECT id, 'activity', 0, 0, CURRENT_DATE, CURRENT_DATE
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM user_streaks us WHERE us.user_id = u.id AND us.streak_type = 'activity'
)
ON CONFLICT (user_id, streak_type) DO NOTHING;
