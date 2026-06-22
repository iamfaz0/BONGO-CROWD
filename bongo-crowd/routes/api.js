const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { ensureAuthenticated } = require('../middleware/auth');

// API endpoints

// Get leaderboard
router.get('/leaderboard', async (req, res) => {
    try {
        const { period = 'all_time' } = req.query;
        
        let query = `
            SELECT u.username, u.display_name, u.avatar_url, u.reputation, u.points, u.total_earnings
            FROM users u
            WHERE u.role = 'hacker' AND u.is_active = true AND u.is_banned = false
        `;
        
        if (period === 'month') {
            // Get current month's leaderboard
            query = `
                SELECT u.username, u.display_name, u.avatar_url,
                       COALESCE(l.points, 0) as points, COALESCE(l.total_earnings, 0) as total_earnings
                FROM users u
                LEFT JOIN leaderboard_entries l ON l.user_id = u.id 
                    AND l.period = 'month' 
                    AND l.period_start = DATE_TRUNC('month', CURRENT_DATE)
                WHERE u.role = 'hacker' AND u.is_active = true AND u.is_banned = false
            `;
        }
        
        query += ' ORDER BY points DESC LIMIT 100';
        
        const result = await db.query(query);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
    }
});

// Search API
router.get('/search', async (req, res) => {
    try {
        const { q, type = 'all' } = req.query;
        
        if (!q || q.length < 2) {
            return res.json({ success: true, data: { programs: [], hackers: [] } });
        }
        
        const results = { programs: [], hackers: [] };
        
        if (type === 'all' || type === 'programs') {
            const programsResult = await db.query(`
                SELECT p.id, p.name, p.slug, p.short_description, p.min_reward, p.max_reward,
                       c.name as company_name, c.logo_url as company_logo
                FROM programs p
                JOIN companies c ON p.company_id = c.id
                WHERE p.status = 'active' AND (
                    p.name ILIKE $1 OR p.description ILIKE $1 OR c.name ILIKE $1
                )
                LIMIT 10
            `, [`%${q}%`]);
            results.programs = programsResult.rows;
        }
        
        if (type === 'all' || type === 'hackers') {
            const hackersResult = await db.query(`
                SELECT id, username, display_name, avatar_url, reputation, points
                FROM users
                WHERE role = 'hacker' AND is_active = true AND is_banned = false
                AND (username ILIKE $1 OR display_name ILIKE $1)
                LIMIT 10
            `, [`%${q}%`]);
            results.hackers = hackersResult.rows;
        }
        
        res.json({ success: true, data: results });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Search failed' });
    }
});

// Get user stats
router.get('/users/:username/stats', async (req, res) => {
    try {
        const userResult = await db.query(`
            SELECT id FROM users WHERE username = $1
        `, [req.params.username]);
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        const userId = userResult.rows[0].id;
        
        const statsResult = await db.query(`
            SELECT 
                COUNT(*) as total_reports,
                COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical,
                COUNT(CASE WHEN severity = 'high' THEN 1 END) as high,
                COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium,
                COUNT(CASE WHEN severity = 'low' THEN 1 END) as low
            FROM reports 
            WHERE researcher_id = $1 AND status = 'resolved'
        `, [userId]);
        
        res.json({ success: true, data: statsResult.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
});

// Mark notification as read
router.post('/notifications/:id/read', ensureAuthenticated, async (req, res) => {
    try {
        await db.query(
            'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to update notification' });
    }
});

// ==================== BOUNTY CALCULATOR API ====================

// Get severity matrix
router.get('/severity-matrix', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT severity, cvss_min, cvss_max, min_bounty, max_bounty, 
                   description, color, icon
            FROM severity_matrix
            WHERE is_active = true
            ORDER BY cvss_max DESC
        `);
        
        res.json({ 
            success: true, 
            data: result.rows,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('Severity matrix error:', err);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch severity matrix' 
        });
    }
});

// Calculate bounty
router.post('/calculate-bounty', async (req, res) => {
    const { 
        cvss_score, 
        program_id,
        impact_confidentiality,
        impact_integrity, 
        impact_availability,
        scope,
        vulnerability_type 
    } = req.body;
    
    try {
        // Validate CVSS score
        const cvss = parseFloat(cvss_score);
        if (isNaN(cvss) || cvss < 0 || cvss > 10) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid CVSS score. Must be between 0 and 10.' 
            });
        }
        
        // Get severity from CVSS
        const severityResult = await db.query(
            'SELECT get_severity_from_cvss($1) as severity',
            [cvss]
        );
        const severity = severityResult.rows[0].severity;
        
        // Get bounty range
        let bountyQuery, bountyParams;
        if (program_id) {
            bountyQuery = 'SELECT * FROM get_bounty_range($1, $2)';
            bountyParams = [program_id, severity];
        } else {
            bountyQuery = `
                SELECT min_bounty, max_bounty 
                FROM severity_matrix 
                WHERE severity = $1 AND is_active = true
            `;
            bountyParams = [severity];
        }
        
        const bountyResult = await db.query(bountyQuery, bountyParams);
        
        if (bountyResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'No bounty range found for this severity' 
            });
        }
        
        const { min_bounty, max_bounty } = bountyResult.rows[0];
        const estimatedBounty = (parseFloat(min_bounty) + parseFloat(max_bounty)) / 2;
        
        // Get severity details
        const severityDetails = await db.query(`
            SELECT description, color, icon 
            FROM severity_matrix 
            WHERE severity = $1 AND is_active = true
        `, [severity]);
        
        // Log calculation (if user is authenticated)
        let userId = null;
        if (req.user && req.user.id) {
            userId = req.user.id;
        }
        
        // Get client IP
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        await db.query(`
            INSERT INTO bounty_calculation_logs 
            (user_id, program_id, cvss_score, severity, calculated_bounty, 
             min_bounty, max_bounty, impact_confidentiality, impact_integrity, 
             impact_availability, scope, user_agent, ip_address)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            userId, program_id || null, cvss, severity, estimatedBounty,
            min_bounty, max_bounty, impact_confidentiality || null,
            impact_integrity || null, impact_availability || null,
            scope || null, req.headers['user-agent'], clientIp
        ]);
        
        res.json({
            success: true,
            data: {
                cvss_score: cvss,
                severity: severity,
                severity_details: severityDetails.rows[0] || null,
                estimated_bounty: estimatedBounty,
                min_bounty: parseFloat(min_bounty),
                max_bounty: parseFloat(max_bounty),
                currency: 'USD',
                program_specific: !!program_id
            }
        });
    } catch (err) {
        console.error('Calculate bounty error:', err);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to calculate bounty' 
        });
    }
});

// Get program-specific bounty ranges
router.get('/programs/:id/bounty-ranges', async (req, res) => {
    try {
        const programId = req.params.id;
        
        // Check program exists
        const programCheck = await db.query(
            'SELECT id FROM programs WHERE id = $1',
            [programId]
        );
        
        if (programCheck.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Program not found' 
            });
        }
        
        // Get program-specific ranges or fall back to global
        const result = await db.query(`
            SELECT sm.severity, sm.cvss_min, sm.cvss_max,
                   COALESCE(pbr.min_bounty, sm.min_bounty) as min_bounty,
                   COALESCE(pbr.max_bounty, sm.max_bounty) as max_bounty,
                   sm.description, sm.color, sm.icon,
                   pbr.is_active as program_override
            FROM severity_matrix sm
            LEFT JOIN program_bounty_ranges pbr ON pbr.severity = sm.severity 
                AND pbr.program_id = $1 AND pbr.is_active = true
            WHERE sm.is_active = true
            ORDER BY sm.cvss_max DESC
        `, [programId]);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (err) {
        console.error('Program bounty ranges error:', err);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch program bounty ranges' 
        });
    }
});

module.exports = router;
