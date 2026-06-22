/**
 * Analytics Routes for BONGO-CROWD
 * Admin and company analytics dashboards
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, requireCompany } = require('../middleware/auth');
const { Pool } = require('pg');
const { Parser } = require('json2csv');

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'bongo_crowd',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
});

/**
 * GET /admin/analytics
 * Admin analytics dashboard
 */
router.get('/admin/analytics', requireAuth, requireAdmin, async (req, res) => {
    try {
        // Get platform statistics
        const platformStats = await pool.query(`
            SELECT * FROM mv_platform_stats LIMIT 1
        `);

        // Get daily submissions for last 30 days
        const dailySubmissions = await pool.query(`
            SELECT submission_date, submission_count,
                   critical_count, high_count, medium_count, low_count, info_count, bounty_total
            FROM mv_daily_submissions
            WHERE submission_date >= CURRENT_DATE - INTERVAL '30 days'
            ORDER BY submission_date ASC
        `);

        // Get monthly analytics for last 12 months
        const monthlyAnalytics = await pool.query(`
            SELECT * FROM mv_monthly_analytics
            WHERE month_start >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
            ORDER BY month_start ASC
        `);

        // Get vulnerability types breakdown
        const vulnerabilityTypes = await pool.query(`
            SELECT vulnerability_type, total_count,
                   critical_count, high_count, medium_count, low_count, avg_bounty
            FROM mv_vulnerability_types
            ORDER BY total_count DESC
            LIMIT 10
        `);

        // Get response time metrics
        const responseTimes = await pool.query(`
            SELECT * FROM mv_response_time_metrics
            ORDER BY month DESC
            LIMIT 12
        `);

        // Get top researchers
        const topResearchers = await pool.query(`
            SELECT * FROM mv_researcher_leaderboard
            LIMIT 10
        `);

        // Get company rankings
        const companyRankings = await pool.query(`
            SELECT * FROM mv_company_analytics
            ORDER BY total_bounties_paid DESC
            LIMIT 10
        `);

        res.render('admin/analytics', {
            user: req.user,
            stats: platformStats.rows[0] || {},
            dailySubmissions: dailySubmissions.rows,
            monthlyAnalytics: monthlyAnalytics.rows,
            vulnerabilityTypes: vulnerabilityTypes.rows,
            responseTimes: responseTimes.rows,
            topResearchers: topResearchers.rows,
            companyRankings: companyRankings.rows
        });
    } catch (error) {
        console.error('Error loading admin analytics:', error);
        res.status(500).render('error', {
            user: req.user,
            status: 500,
            message: 'Failed to load analytics dashboard'
        });
    }
});

/**
 * GET /companies/:id/analytics
 * Company-specific analytics dashboard
 */
router.get('/companies/:id/analytics', requireAuth, requireCompany, async (req, res) => {
    const companyId = req.params.id;
    
    try {
        // Verify company access
        const companyCheck = await pool.query(`
            SELECT id, name, slug FROM companies 
            WHERE id = $1 AND (admin_id = $2 OR EXISTS (
                SELECT 1 FROM users WHERE id = $2 AND role = 'admin'
            ))
        `, [companyId, req.user.id]);

        if (companyCheck.rows.length === 0) {
            return res.status(403).render('error', {
                user: req.user,
                status: 403,
                message: 'Access denied to this company analytics'
            });
        }

        const company = companyCheck.rows[0];

        // Get company statistics
        const companyStats = await pool.query(`
            SELECT * FROM mv_company_analytics WHERE company_id = $1
        `, [companyId]);

        // Get daily submissions for company
        const dailySubmissions = await pool.query(`
            SELECT 
                DATE(r.submitted_at) as submission_date,
                COUNT(*) as submission_count,
                COUNT(DISTINCT CASE WHEN r.severity = 'critical' THEN r.id END) as critical_count,
                COUNT(DISTINCT CASE WHEN r.severity = 'high' THEN r.id END) as high_count,
                COUNT(DISTINCT CASE WHEN r.severity = 'medium' THEN r.id END) as medium_count,
                COUNT(DISTINCT CASE WHEN r.severity = 'low' THEN r.id END) as low_count,
                COUNT(DISTINCT CASE WHEN r.severity = 'info' THEN r.id END) as info_count,
                COALESCE(SUM(r.bounty_amount), 0) as bounty_total
            FROM reports r
            JOIN programs p ON r.program_id = p.id
            WHERE p.company_id = $1 
              AND DATE(r.submitted_at) >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY DATE(r.submitted_at)
            ORDER BY submission_date ASC
        `, [companyId]);

        // Get vulnerability types for company
        const vulnerabilityTypes = await pool.query(`
            SELECT 
                r.vulnerability_type,
                COUNT(*) as total_count,
                COUNT(DISTINCT CASE WHEN r.severity = 'critical' THEN r.id END) as critical_count,
                COUNT(DISTINCT CASE WHEN r.severity = 'high' THEN r.id END) as high_count,
                COUNT(DISTINCT CASE WHEN r.severity = 'medium' THEN r.id END) as medium_count,
                COUNT(DISTINCT CASE WHEN r.severity = 'low' THEN r.id END) as low_count,
                AVG(CASE WHEN r.bounty_amount > 0 THEN r.bounty_amount END) as avg_bounty
            FROM reports r
            JOIN programs p ON r.program_id = p.id
            WHERE p.company_id = $1 AND r.vulnerability_type IS NOT NULL
            GROUP BY r.vulnerability_type
            ORDER BY total_count DESC
            LIMIT 10
        `, [companyId]);

        // Get program statistics
        const programStats = await pool.query(`
            SELECT 
                p.id, p.name, p.status,
                COUNT(r.id) as total_reports,
                COUNT(DISTINCT CASE WHEN r.status IN ('accepted', 'resolved') THEN r.id END) as accepted_reports,
                COALESCE(SUM(r.bounty_amount), 0) as total_bounties,
                AVG(CASE WHEN r.bounty_amount > 0 THEN r.bounty_amount END) as avg_bounty
            FROM programs p
            LEFT JOIN reports r ON p.id = r.program_id
            WHERE p.company_id = $1
            GROUP BY p.id, p.name, p.status
            ORDER BY total_reports DESC
        `, [companyId]);

        // Get response time metrics for company
        const responseTimes = await pool.query(`
            SELECT 
                DATE_TRUNC('month', r.submitted_at) as month,
                AVG(EXTRACT(EPOCH FROM (r.triaged_at - r.submitted_at))/3600) as avg_triage_hours,
                AVG(EXTRACT(EPOCH FROM (r.resolved_at - r.submitted_at))/3600) as avg_resolution_hours,
                AVG(EXTRACT(EPOCH FROM (r.bounty_paid_at - r.accepted_at))/3600) as avg_bounty_payment_hours,
                COUNT(*) as total_reports
            FROM reports r
            JOIN programs p ON r.program_id = p.id
            WHERE p.company_id = $1 
              AND (r.triaged_at IS NOT NULL OR r.resolved_at IS NOT NULL)
            GROUP BY DATE_TRUNC('month', r.submitted_at)
            ORDER BY month DESC
            LIMIT 12
        `, [companyId]);

        // Get top researchers for company
        const topResearchers = await pool.query(`
            SELECT 
                u.id, u.username, u.display_name, u.avatar_url,
                COUNT(r.id) as report_count,
                COUNT(DISTINCT CASE WHEN r.status IN ('accepted', 'resolved') THEN r.id END) as accepted_count,
                COALESCE(SUM(r.bounty_amount), 0) as total_earned,
                AVG(CASE WHEN r.bounty_amount > 0 THEN r.bounty_amount END) as avg_bounty
            FROM reports r
            JOIN programs p ON r.program_id = p.id
            JOIN users u ON r.researcher_id = u.id
            WHERE p.company_id = $1
            GROUP BY u.id, u.username, u.display_name, u.avatar_url
            ORDER BY total_earned DESC, report_count DESC
            LIMIT 10
        `, [companyId]);

        // Get bounty trends by month
        const bountyTrends = await pool.query(`
            SELECT 
                DATE_TRUNC('month', r.bounty_paid_at) as month,
                COALESCE(SUM(r.bounty_amount), 0) as total_bounties,
                COUNT(*) as paid_reports
            FROM reports r
            JOIN programs p ON r.program_id = p.id
            WHERE p.company_id = $1 
              AND r.bounty_paid = true
              AND r.bounty_paid_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
            GROUP BY DATE_TRUNC('month', r.bounty_paid_at)
            ORDER BY month ASC
        `, [companyId]);

        res.render('companies/analytics', {
            user: req.user,
            company: company,
            stats: companyStats.rows[0] || {},
            dailySubmissions: dailySubmissions.rows,
            vulnerabilityTypes: vulnerabilityTypes.rows,
            programStats: programStats.rows,
            responseTimes: responseTimes.rows,
            topResearchers: topResearchers.rows,
            bountyTrends: bountyTrends.rows
        });
    } catch (error) {
        console.error('Error loading company analytics:', error);
        res.status(500).render('error', {
            user: req.user,
            status: 500,
            message: 'Failed to load company analytics dashboard'
        });
    }
});

/**
 * GET /api/analytics/reports
 * API endpoint for chart data
 */
router.get('/api/analytics/reports', requireAuth, async (req, res) => {
    try {
        const { scope, companyId, period = '30d', type = 'all' } = req.query;
        
        let query;
        let params = [];
        
        // Determine date range based on period
        let dateFilter = '';
        switch(period) {
            case '7d':
                dateFilter = "AND submitted_at >= CURRENT_DATE - INTERVAL '7 days'";
                break;
            case '30d':
                dateFilter = "AND submitted_at >= CURRENT_DATE - INTERVAL '30 days'";
                break;
            case '90d':
                dateFilter = "AND submitted_at >= CURRENT_DATE - INTERVAL '90 days'";
                break;
            case '1y':
                dateFilter = "AND submitted_at >= CURRENT_DATE - INTERVAL '1 year'";
                break;
            case 'all':
                dateFilter = '';
                break;
        }

        let response = {};

        // Submissions over time
        if (type === 'all' || type === 'submissions') {
            if (scope === 'company' && companyId) {
                query = `
                    SELECT 
                        DATE(r.submitted_at) as date,
                        COUNT(*) as count,
                        COUNT(DISTINCT CASE WHEN r.severity = 'critical' THEN r.id END) as critical,
                        COUNT(DISTINCT CASE WHEN r.severity = 'high' THEN r.id END) as high,
                        COUNT(DISTINCT CASE WHEN r.severity = 'medium' THEN r.id END) as medium,
                        COUNT(DISTINCT CASE WHEN r.severity = 'low' THEN r.id END) as low,
                        COUNT(DISTINCT CASE WHEN r.severity = 'info' THEN r.id END) as info
                    FROM reports r
                    JOIN programs p ON r.program_id = p.id
                    WHERE p.company_id = $1 ${dateFilter}
                    GROUP BY DATE(r.submitted_at)
                    ORDER BY date ASC
                `;
                params = [companyId];
            } else {
                query = `
                    SELECT 
                        submission_date as date,
                        submission_count as count,
                        critical_count as critical,
                        high_count as high,
                        medium_count as medium,
                        low_count as low,
                        info_count as info
                    FROM mv_daily_submissions
                    WHERE submission_date >= CURRENT_DATE - INTERVAL '${period === 'all' ? '1 year' : period.replace('d', ' days').replace('y', ' year')}'
                    ORDER BY date ASC
                `;
            }
            const result = await pool.query(query, params);
            response.submissions = result.rows;
        }

        // Severity breakdown
        if (type === 'all' || type === 'severity') {
            if (scope === 'company' && companyId) {
                query = `
                    SELECT 
                        r.severity,
                        COUNT(*) as count,
                        COALESCE(SUM(r.bounty_amount), 0) as total_bounties
                    FROM reports r
                    JOIN programs p ON r.program_id = p.id
                    WHERE p.company_id = $1 ${dateFilter}
                    GROUP BY r.severity
                `;
                params = [companyId];
            } else {
                query = `
                    SELECT 
                        severity,
                        COUNT(*) as count
                    FROM reports
                    WHERE 1=1 ${dateFilter}
                    GROUP BY severity
                `;
            }
            const result = await pool.query(query, params);
            response.severity = result.rows;
        }

        // Vulnerability types
        if (type === 'all' || type === 'vulnerability_types') {
            if (scope === 'company' && companyId) {
                query = `
                    SELECT 
                        r.vulnerability_type as type,
                        COUNT(*) as count
                    FROM reports r
                    JOIN programs p ON r.program_id = p.id
                    WHERE p.company_id = $1 AND r.vulnerability_type IS NOT NULL ${dateFilter}
                    GROUP BY r.vulnerability_type
                    ORDER BY count DESC
                    LIMIT 10
                `;
                params = [companyId];
            } else {
                query = `
                    SELECT vulnerability_type as type, total_count as count
                    FROM mv_vulnerability_types
                    ORDER BY total_count DESC
                    LIMIT 10
                `;
            }
            const result = await pool.query(query, params);
            response.vulnerabilityTypes = result.rows;
        }

        // Bounty trends
        if (type === 'all' || type === 'bounties') {
            if (scope === 'company' && companyId) {
                query = `
                    SELECT 
                        DATE_TRUNC('month', r.bounty_paid_at) as month,
                        COALESCE(SUM(r.bounty_amount), 0) as total_bounties,
                        COUNT(*) as paid_count
                    FROM reports r
                    JOIN programs p ON r.program_id = p.id
                    WHERE p.company_id = $1 AND r.bounty_paid = true ${dateFilter}
                    GROUP BY DATE_TRUNC('month', r.bounty_paid_at)
                    ORDER BY month ASC
                `;
                params = [companyId];
            } else {
                query = `
                    SELECT 
                        month_start as month,
                        total_bounties,
                        paid_reports as paid_count
                    FROM mv_monthly_analytics
                    WHERE month_start >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
                    ORDER BY month ASC
                `;
            }
            const result = await pool.query(query, params);
            response.bounties = result.rows;
        }

        // Response time metrics
        if (type === 'all' || type === 'response_times') {
            query = `
                SELECT 
                    AVG(EXTRACT(EPOCH FROM (triaged_at - submitted_at))/3600) as avg_triage_hours,
                    AVG(EXTRACT(EPOCH FROM (resolved_at - submitted_at))/3600) as avg_resolution_hours,
                    AVG(EXTRACT(EPOCH FROM (bounty_paid_at - accepted_at))/3600) as avg_bounty_hours
                FROM reports
                WHERE triaged_at IS NOT NULL OR resolved_at IS NOT NULL
            `;
            const result = await pool.query(query);
            response.responseTimes = result.rows[0];
        }

        res.json({
            success: true,
            data: response,
            scope: scope || 'platform',
            period: period
        });
    } catch (error) {
        console.error('Error fetching analytics data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analytics data'
        });
    }
});

/**
 * GET /api/analytics/export/csv
 * Export analytics data to CSV
 */
router.get('/api/analytics/export/csv', requireAuth, async (req, res) => {
    try {
        const { scope, companyId, reportType = 'reports' } = req.query;
        
        let query;
        let params = [];
        let fields = [];
        let filename = '';

        switch(reportType) {
            case 'reports':
                if (scope === 'company' && companyId) {
                    query = `
                        SELECT 
                            r.report_id,
                            r.title,
                            r.vulnerability_type,
                            r.severity,
                            r.status,
                            r.bounty_amount,
                            r.bounty_paid,
                            r.submitted_at,
                            r.resolved_at,
                            u.username as researcher,
                            p.name as program
                        FROM reports r
                        JOIN programs p ON r.program_id = p.id
                        JOIN users u ON r.researcher_id = u.id
                        WHERE p.company_id = $1
                        ORDER BY r.submitted_at DESC
                    `;
                    params = [companyId];
                    filename = `company_${companyId}_reports.csv`;
                } else {
                    query = `
                        SELECT 
                            r.report_id,
                            r.title,
                            r.vulnerability_type,
                            r.severity,
                            r.status,
                            r.bounty_amount,
                            r.bounty_paid,
                            r.submitted_at,
                            r.resolved_at,
                            u.username as researcher,
                            c.name as company,
                            p.name as program
                        FROM reports r
                        JOIN users u ON r.researcher_id = u.id
                        JOIN programs p ON r.program_id = p.id
                        JOIN companies c ON p.company_id = c.id
                        ORDER BY r.submitted_at DESC
                    `;
                    filename = 'platform_reports.csv';
                }
                fields = [
                    { label: 'Report ID', value: 'report_id' },
                    { label: 'Title', value: 'title' },
                    { label: 'Type', value: 'vulnerability_type' },
                    { label: 'Severity', value: 'severity' },
                    { label: 'Status', value: 'status' },
                    { label: 'Bounty', value: 'bounty_amount' },
                    { label: 'Paid', value: 'bounty_paid' },
                    { label: 'Submitted', value: 'submitted_at' },
                    { label: 'Resolved', value: 'resolved_at' },
                    { label: 'Researcher', value: 'researcher' },
                    { label: 'Company', value: 'company' },
                    { label: 'Program', value: 'program' }
                ];
                break;

            case 'bounties':
                if (scope === 'company' && companyId) {
                    query = `
                        SELECT 
                            r.report_id,
                            r.title,
                            r.bounty_amount,
                            r.bounty_paid_at,
                            u.username as researcher,
                            p.name as program
                        FROM reports r
                        JOIN programs p ON r.program_id = p.id
                        JOIN users u ON r.researcher_id = u.id
                        WHERE p.company_id = $1 AND r.bounty_paid = true
                        ORDER BY r.bounty_paid_at DESC
                    `;
                    params = [companyId];
                    filename = `company_${companyId}_bounties.csv`;
                } else {
                    query = `
                        SELECT 
                            r.report_id,
                            r.title,
                            r.bounty_amount,
                            r.bounty_paid_at,
                            u.username as researcher,
                            c.name as company,
                            p.name as program
                        FROM reports r
                        JOIN programs p ON r.program_id = p.id
                        JOIN users u ON r.researcher_id = u.id
                        JOIN companies c ON p.company_id = c.id
                        WHERE r.bounty_paid = true
                        ORDER BY r.bounty_paid_at DESC
                    `;
                    filename = 'platform_bounties.csv';
                }
                fields = [
                    { label: 'Report ID', value: 'report_id' },
                    { label: 'Title', value: 'title' },
                    { label: 'Bounty Amount', value: 'bounty_amount' },
                    { label: 'Paid At', value: 'bounty_paid_at' },
                    { label: 'Researcher', value: 'researcher' },
                    { label: 'Company', value: 'company' },
                    { label: 'Program', value: 'program' }
                ];
                break;

            case 'metrics':
                // Export summary metrics
                if (scope === 'company' && companyId) {
                    query = `
                        SELECT 
                            p.name as program_name,
                            COUNT(r.id) as total_reports,
                            COUNT(DISTINCT CASE WHEN r.severity = 'critical' THEN r.id END) as critical,
                            COUNT(DISTINCT CASE WHEN r.severity = 'high' THEN r.id END) as high,
                            COUNT(DISTINCT CASE WHEN r.severity = 'medium' THEN r.id END) as medium,
                            COUNT(DISTINCT CASE WHEN r.severity = 'low' THEN r.id END) as low,
                            COUNT(DISTINCT CASE WHEN r.status IN ('accepted', 'resolved') THEN r.id END) as accepted,
                            COALESCE(SUM(r.bounty_amount), 0) as total_bounties
                        FROM programs p
                        LEFT JOIN reports r ON p.id = r.program_id
                        WHERE p.company_id = $1
                        GROUP BY p.id, p.name
                        ORDER BY total_reports DESC
                    `;
                    params = [companyId];
                    filename = `company_${companyId}_metrics.csv`;
                } else {
                    query = `
                        SELECT 
                            c.name as company_name,
                            COUNT(r.id) as total_reports,
                            COALESCE(SUM(r.bounty_amount), 0) as total_bounties
                        FROM companies c
                        LEFT JOIN programs p ON c.id = p.company_id
                        LEFT JOIN reports r ON p.id = r.program_id
                        GROUP BY c.id, c.name
                        ORDER BY total_reports DESC
                    `;
                    filename = 'platform_metrics.csv';
                }
                fields = [
                    { label: 'Name', value: scope === 'company' ? 'program_name' : 'company_name' },
                    { label: 'Total Reports', value: 'total_reports' },
                    { label: 'Critical', value: 'critical' },
                    { label: 'High', value: 'high' },
                    { label: 'Medium', value: 'medium' },
                    { label: 'Low', value: 'low' },
                    { label: 'Accepted', value: 'accepted' },
                    { label: 'Total Bounties', value: 'total_bounties' }
                ];
                break;
        }

        const result = await pool.query(query, params);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No data to export'
            });
        }

        // Create CSV
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(result.rows);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (error) {
        console.error('Error exporting CSV:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to export data'
        });
    }
});

/**
 * POST /api/analytics/refresh
 * Refresh materialized views (admin only)
 */
router.post('/api/analytics/refresh', requireAuth, requireAdmin, async (req, res) => {
    try {
        await pool.query('SELECT refresh_analytics_views()');
        res.json({
            success: true,
            message: 'Analytics data refreshed successfully'
        });
    } catch (error) {
        console.error('Error refreshing analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to refresh analytics data'
        });
    }
});

module.exports = router;
