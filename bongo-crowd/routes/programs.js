const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { formatCurrency, timeAgo } = require('../utils/site');

// Programs listing
router.get('/', async (req, res) => {
    try {
        const { scope = 'all', sort = 'newest', min_reward, max_reward } = req.query;
        
        let query = `
            SELECT p.*, c.name as company_name, c.logo_url as company_logo, c.is_verified
            FROM programs p
            JOIN companies c ON p.company_id = c.id
            WHERE p.status = 'active'
        `;
        
        const params = [];
        let paramIndex = 1;
        
        // Filter by scope
        if (scope !== 'all') {
            query += ` AND $${paramIndex} = ANY(p.in_scope_domains)`;
            params.push(scope);
            paramIndex++;
        }
        
        // Filter by reward range
        if (min_reward) {
            query += ` AND p.max_reward >= $${paramIndex}`;
            params.push(min_reward);
            paramIndex++;
        }
        
        if (max_reward) {
            query += ` AND p.min_reward <= $${paramIndex}`;
            params.push(max_reward);
            paramIndex++;
        }
        
        // Sorting
        switch (sort) {
            case 'highest-reward':
                query += ' ORDER BY p.max_reward DESC NULLS LAST';
                break;
            case 'most-reports':
                query += ' ORDER BY p.total_reports DESC';
                break;
            case 'oldest':
                query += ' ORDER BY p.created_at ASC';
                break;
            default: // newest
                query += ' ORDER BY p.created_at DESC';
        }
        
        const result = await db.query(query, params);
        
        // Get unique scopes for filter
        const scopesResult = await db.query(`
            SELECT DISTINCT unnest(in_scope_domains) as scope
            FROM programs WHERE status = 'active'
            ORDER BY scope
        `);
        
        res.render('programs/index', {
            title: 'Bug Bounty Programs',
            programs: result.rows,
            scopes: scopesResult.rows,
            filters: { scope, sort, min_reward, max_reward },
            formatCurrency
        });
    } catch (err) {
        console.error(err);
        res.render('programs/index', {
            title: 'Bug Bounty Programs',
            programs: [],
            scopes: [],
            filters: { scope: 'all', sort: 'newest' },
            formatCurrency
        });
    }
});

// Single program view
router.get('/:slug', async (req, res) => {
    try {
        const programResult = await db.query(`
            SELECT p.*, c.name as company_name, c.description as company_description,
                   c.logo_url as company_logo, c.website as company_website,
                   c.location as company_location, c.size as company_size
            FROM programs p
            JOIN companies c ON p.company_id = c.id
            WHERE p.slug = $1 AND p.status = 'active'
        `, [req.params.slug]);
        
        if (programResult.rows.length === 0) {
            return res.status(404).render('error', {
                title: 'Program Not Found',
                message: 'This program does not exist or is not currently active.'
            });
        }
        
        const program = programResult.rows[0];
        
        // Get recent disclosed reports for this program
        const reportsResult = await db.query(`
            SELECT r.report_id, r.disclosure_title, r.severity, r.disclosed_at,
                   u.username, u.avatar_url
            FROM reports r
            JOIN users u ON r.researcher_id = u.id
            WHERE r.program_id = $1 AND r.disclosure_allowed = true AND r.disclosed_at IS NOT NULL
            ORDER BY r.disclosed_at DESC
            LIMIT 10
        `, [program.id]);
        
        // Get top researchers for this program
        const hackersResult = await db.query(`
            SELECT u.username, u.avatar_url, COUNT(r.id) as report_count, 
                   SUM(r.bounty_amount) as total_earned
            FROM reports r
            JOIN users u ON r.researcher_id = u.id
            WHERE r.program_id = $1 AND r.bounty_paid = true
            GROUP BY u.id, u.username, u.avatar_url
            ORDER BY total_earned DESC
            LIMIT 5
        `, [program.id]);
        
        res.render('programs/show', {
            title: program.name,
            program,
            reports: reportsResult.rows,
            hackers: hackersResult.rows,
            formatCurrency,
            timeAgo
        });
    } catch (err) {
        console.error(err);
        res.redirect('/programs');
    }
});

module.exports = router;
