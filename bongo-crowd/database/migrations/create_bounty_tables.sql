-- Bounty Calculator Tables Migration
-- Creates severity_matrix and bounty_calculation_logs tables

-- Severity Matrix table
CREATE TABLE IF NOT EXISTS severity_matrix (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    cvss_min DECIMAL(3,1) NOT NULL,
    cvss_max DECIMAL(3,1) NOT NULL,
    min_bounty DECIMAL(10,2) NOT NULL DEFAULT 0,
    max_bounty DECIMAL(10,2) NOT NULL DEFAULT 0,
    description TEXT,
    color VARCHAR(20) NOT NULL DEFAULT '#64748b',
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(severity)
);

-- Bounty Calculation Logs table
CREATE TABLE IF NOT EXISTS bounty_calculation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    program_id UUID REFERENCES programs(id) ON DELETE SET NULL,
    cvss_score DECIMAL(3,1),
    severity VARCHAR(20),
    calculated_bounty DECIMAL(10,2),
    min_bounty DECIMAL(10,2),
    max_bounty DECIMAL(10,2),
    impact_confidentiality VARCHAR(20),
    impact_integrity VARCHAR(20),
    impact_availability VARCHAR(20),
    scope VARCHAR(20),
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Program-specific bounty overrides table
CREATE TABLE IF NOT EXISTS program_bounty_ranges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    min_bounty DECIMAL(10,2) NOT NULL DEFAULT 0,
    max_bounty DECIMAL(10,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(program_id, severity)
);

-- Insert default severity matrix values
INSERT INTO severity_matrix (severity, cvss_min, cvss_max, min_bounty, max_bounty, description, color, icon) VALUES
    ('critical', 9.0, 10.0, 5000, 20000, 'Critical vulnerabilities that pose immediate and severe risk to the organization. These typically allow complete system compromise, data breach of sensitive information, or widespread disruption of services.', '#ef4444', '💀'),
    ('high', 7.0, 8.9, 1000, 5000, 'High severity vulnerabilities that could lead to significant security impacts. These may allow access to sensitive data, privilege escalation, or serious disruption of business operations.', '#f97316', '🔥'),
    ('medium', 4.0, 6.9, 250, 1000, 'Medium severity vulnerabilities that present moderate risk. These typically require specific conditions to exploit or have limited impact scope.', '#eab308', '⚡'),
    ('low', 0.1, 3.9, 50, 250, 'Low severity vulnerabilities with minimal security impact. These may include minor information disclosure or best practice violations.', '#22c55e', '📝'),
    ('info', 0, 0, 0, 0, 'Informational findings that don''t present immediate security risk but may include recommendations for security improvements or best practices. Typically rewarded with swag or points only.', '#3b82f6', 'ℹ️')
ON CONFLICT (severity) DO UPDATE SET
    cvss_min = EXCLUDED.cvss_min,
    cvss_max = EXCLUDED.cvss_max,
    min_bounty = EXCLUDED.min_bounty,
    max_bounty = EXCLUDED.max_bounty,
    description = EXCLUDED.description,
    color = EXCLUDED.color,
    icon = EXCLUDED.icon;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_severity_matrix_severity ON severity_matrix(severity);
CREATE INDEX IF NOT EXISTS idx_severity_matrix_cvss_range ON severity_matrix(cvss_min, cvss_max);
CREATE INDEX IF NOT EXISTS idx_bounty_logs_user ON bounty_calculation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_bounty_logs_program ON bounty_calculation_logs(program_id);
CREATE INDEX IF NOT EXISTS idx_bounty_logs_created ON bounty_calculation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_program_bounty_program ON program_bounty_ranges(program_id);

-- Function to get severity from CVSS score
CREATE OR REPLACE FUNCTION get_severity_from_cvss(cvss DECIMAL)
RETURNS VARCHAR AS $$
DECLARE
    sev VARCHAR;
BEGIN
    SELECT severity INTO sev FROM severity_matrix
    WHERE cvss_min <= cvss AND cvss_max >= cvss AND is_active = true
    ORDER BY cvss_max DESC LIMIT 1;
    
    IF sev IS NULL THEN
        sev := 'info';
    END IF;
    
    RETURN sev;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate bounty range for a program
CREATE OR REPLACE FUNCTION get_bounty_range(p_program_id UUID, p_severity VARCHAR)
RETURNS TABLE(min_bounty DECIMAL, max_bounty DECIMAL) AS $$
BEGIN
    -- Check for program-specific override
    RETURN QUERY
    SELECT pbr.min_bounty, pbr.max_bounty
    FROM program_bounty_ranges pbr
    WHERE pbr.program_id = p_program_id 
      AND pbr.severity = p_severity 
      AND pbr.is_active = true;
    
    -- If no program-specific range, use global
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT sm.min_bounty, sm.max_bounty
        FROM severity_matrix sm
        WHERE sm.severity = p_severity AND sm.is_active = true;
    END IF;
END;
$$ LANGUAGE plpgsql;
